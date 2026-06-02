import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type {
  Organization,
  OrganizationInsert,
  OrgType,
} from "@/types/database";
import type { CreateOrganizationInput } from "@/features/organizations/schemas";

/**
 * Organization server-state hooks (React Query).
 *
 * All organization reads/writes flow through these hooks rather than
 * effect-based fetching (Requirements 9.6, 5.5). Tenant isolation is NOT done
 * here: the `organizations` RLS policy (`owner_id = auth.uid()`) already scopes
 * every read to the signed-in admin (Requirement 9.1), so the hooks never
 * filter by owner. They only express the optional directory search/type filters
 * (Requirement 18) and the DB-computed member count (Requirement 9.3).
 *
 * Query-key layout (hierarchical so invalidation is precise):
 *   - list   -> ['organizations', filters]   (per-filter cache entry)
 *   - detail -> ['organizations', orgId]
 *   - create invalidates the ['organizations'] prefix, refreshing every list
 *     and detail entry so the new org appears without a reload (Requirement 5.5).
 *
 * _Requirements: 5.1, 5.5, 9.1, 9.3, 9.6_
 */

/* ------------------------------------------------------------------------- */
/* Types                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Optional directory filters. Both are applied server-side (Requirement 18):
 * `search` as a case-insensitive name substring match, `type` as an exact
 * Organization_Type match. Participating in the query key means each filter
 * combination is cached independently.
 */
export interface OrganizationFilters {
  /** Case-insensitive substring matched against the organization name. */
  search?: string;
  /** Exact Organization_Type match. */
  type?: OrgType;
}

/**
 * An organization enriched with its DB-computed member count. This is the shape
 * consumed by the DirectoryPage row (name, type badge, member count, creation
 * date) and by the OrgDetailPage header.
 *
 * `memberCount` always equals the number of `organization_members` rows for the
 * org because it is computed by Postgres via the embedded `count` aggregate,
 * never derived on the client (Requirement 9.3).
 */
export interface OrganizationWithMemberCount extends Organization {
  /** Number of `organization_members` rows belonging to this organization. */
  memberCount: number;
}

/**
 * Raw row shape returned by the embedded-count select. PostgREST returns the
 * aggregate as a single-element array `[{ count }]` (or an empty array when the
 * org has no members), which {@link toOrganizationWithMemberCount} flattens.
 */
export interface OrganizationRowWithMemberCount extends Organization {
  organization_members: { count: number }[];
}

/* ------------------------------------------------------------------------- */
/* Query keys                                                                */
/* ------------------------------------------------------------------------- */

/** Shared key root; invalidating it refreshes every list and detail entry. */
const ORGANIZATIONS_KEY = "organizations" as const;

/**
 * Centralized query-key factory so producers (hooks) and consumers
 * (invalidation) stay in lockstep.
 */
export const organizationKeys = {
  /** Root prefix matched by `invalidateQueries` to cover lists + details. */
  all: [ORGANIZATIONS_KEY] as const,
  /** Per-filter directory list key. */
  list: (filters: OrganizationFilters) =>
    [ORGANIZATIONS_KEY, filters] as const,
  /** Single-organization detail key. */
  detail: (orgId: string) => [ORGANIZATIONS_KEY, orgId] as const,
};

/* ------------------------------------------------------------------------- */
/* Internal helpers                                                          */
/* ------------------------------------------------------------------------- */

/**
 * The columns + embedded member-count aggregate used by both the directory list
 * and the single-org read, so the member count is computed by the database in a
 * single round-trip (Requirement 9.3).
 */
const ORG_WITH_COUNT_SELECT = "*, organization_members(count)";

/**
 * Escape characters that are wildcards in a SQL LIKE/ILIKE pattern so a user's
 * search term is matched literally (e.g. a typed `%` matches a literal percent,
 * not "any sequence"). The substring match is added by wrapping in `%...%`.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Flatten the embedded `[{ count }]` aggregate into a flat `memberCount`. */
export function toOrganizationWithMemberCount(
  row: OrganizationRowWithMemberCount,
): OrganizationWithMemberCount {
  const { organization_members, ...organization } = row;
  const memberCount = organization_members?.[0]?.count ?? 0;
  return { ...organization, memberCount };
}

/* ------------------------------------------------------------------------- */
/* Hooks                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * List the organizations owned by the signed-in admin, each enriched with its
 * member count (Requirements 9.1, 9.3, 9.6). RLS scopes the result to the owner
 * automatically, so no owner filter is applied here.
 *
 * The optional {@link OrganizationFilters} are pushed to the server: `type` via
 * an exact match and `search` via a case-insensitive `ilike` substring match
 * (Requirement 18.1, 18.2). Results are ordered newest-first.
 */
export function useOrganizations(
  filters: OrganizationFilters = {},
): UseQueryResult<OrganizationWithMemberCount[], Error> {
  return useQuery<OrganizationWithMemberCount[], Error>({
    queryKey: organizationKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("organizations")
        .select(ORG_WITH_COUNT_SELECT);

      if (filters.type) {
        query = query.eq("type", filters.type);
      }

      const search = filters.search?.trim();
      if (search) {
        query = query.ilike("name", `%${escapeLikePattern(search)}%`);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .returns<OrganizationRowWithMemberCount[]>();

      if (error) {
        throw error;
      }

      return (data ?? []).map(toOrganizationWithMemberCount);
    },
  });
}

/**
 * Read a single organization (with its member count) by id (Requirement 9.3).
 * Returns `null` when the org does not exist or is not owned by the caller (RLS
 * filters it out). The query is disabled until a non-empty `orgId` is provided.
 */
export function useOrganization(
  orgId: string,
): UseQueryResult<OrganizationWithMemberCount | null, Error> {
  return useQuery<OrganizationWithMemberCount | null, Error>({
    queryKey: organizationKeys.detail(orgId),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select(ORG_WITH_COUNT_SELECT)
        .eq("id", orgId)
        .limit(1)
        .returns<OrganizationRowWithMemberCount[]>();

      if (error) {
        throw error;
      }

      const row = data?.[0];
      return row ? toOrganizationWithMemberCount(row) : null;
    },
  });
}

/**
 * Create an organization owned by the signed-in admin (Requirement 5.1).
 *
 * The owner is stamped from the current auth user id; this satisfies the
 * `organizations` INSERT RLS policy (`WITH CHECK (owner_id = auth.uid())`) and
 * records the creating admin as owner (Requirement 5.6 — `created_at` defaults
 * server-side). On success the `['organizations']` prefix is invalidated so the
 * new org appears in the directory without a full reload (Requirement 5.5).
 *
 * Accepts the validated {@link CreateOrganizationInput} (a discriminated union),
 * so `school_district` is only present — and only forwarded — for School orgs.
 */
export function useCreateOrganization(): UseMutationResult<
  Organization,
  Error,
  CreateOrganizationInput
> {
  const queryClient = useQueryClient();

  return useMutation<Organization, Error, CreateOrganizationInput>({
    mutationFn: async (input) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }
      if (!user) {
        throw new Error("You must be signed in to create an organization.");
      }

      const payload: OrganizationInsert = {
        name: input.name,
        type: input.type,
        owner_id: user.id,
        ...(input.type === "school"
          ? { school_district: input.school_district }
          : {}),
      };

      const { data, error } = await supabase
        .from("organizations")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      // Refresh every directory list + detail entry (Requirement 5.5).
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}
