import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { organizationKeys } from "@/features/organizations/hooks";
import type { OrganizationMember } from "@/types/database";
import type { InviteMemberInput } from "@/features/members/schemas";

/**
 * Member server-state hooks (React Query).
 *
 * The members list is read directly from `organization_members` under RLS, and
 * invitations are created through the privileged `invite-member` Edge Function
 * (never as a raw client write) so ownership verification and duplicate
 * prevention happen server-side. Both reads and the invite mutation flow through
 * React Query rather than effect-based fetching (Requirement 8.4).
 *
 * Query-key layout (kept parallel to the organization keys so invalidation is
 * precise):
 *   - list -> ['members', orgId]
 *
 * A successful invite invalidates BOTH the members list for the org AND the
 * `['organizations']` prefix, so the member appears in the list (Requirement
 * 7.6) and the directory's member count for that org increases by exactly one
 * after refetch (Requirement 9.4).
 *
 * _Requirements: 7.6, 8.4, 9.4_
 */

/* ------------------------------------------------------------------------- */
/* Query keys                                                                */
/* ------------------------------------------------------------------------- */

/** Shared key root; invalidating it refreshes every org's member list. */
const MEMBERS_KEY = "members" as const;

/**
 * Centralized member query-key factory so the producing hook and the
 * invalidating mutation stay in lockstep.
 */
export const memberKeys = {
  /** Root prefix matched by `invalidateQueries` to cover every org's list. */
  all: [MEMBERS_KEY] as const,
  /** Per-organization members list key. */
  list: (orgId: string) => [MEMBERS_KEY, orgId] as const,
};

/* ------------------------------------------------------------------------- */
/* Edge Function contract + error handling                                   */
/* ------------------------------------------------------------------------- */

/** Name of the privileged invite Edge Function (see supabase/functions). */
const INVITE_FUNCTION_NAME = "invite-member";

/**
 * Success body returned by the `invite-member` Edge Function on `201`
 * (`{ member }`). Matches the design's API contract.
 */
interface InviteMemberResponse {
  member: OrganizationMember;
}

/**
 * Error raised when the invite Edge Function rejects the request. Carries the
 * HTTP `status` (400/401/403/409/…) alongside a user-facing `message` so the
 * invite form can present the right feedback (e.g. duplicate vs. forbidden).
 *
 * The `message` is the function's own error text when available, falling back
 * to a sensible default for the status code.
 */
export class InviteMemberError extends Error {
  /** HTTP status returned by the Edge Function, when known. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "InviteMemberError";
    this.status = status;
  }
}

/**
 * Default, user-facing message for each Edge Function status code, used when
 * the function did not include a more specific message in its response body.
 * Pure and exported so it can be unit-tested without touching the network.
 */
export function defaultInviteErrorMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return "Enter a valid email address.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to invite members to this organization.";
    case 409:
      return "That email has already been invited to this organization.";
    default:
      return "The invitation could not be sent. Please try again.";
  }
}

/**
 * Pull the most specific human-readable message out of an Edge Function error
 * body. Functions return either `{ error: string }` or `{ message: string }`;
 * anything else falls back to the status default.
 */
function messageFromBody(
  body: unknown,
  status: number | undefined,
): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }
  return defaultInviteErrorMessage(status);
}

/**
 * Normalize whatever `supabase.functions.invoke` reports in its `error` channel
 * into an {@link InviteMemberError} with a status and a presentable message.
 *
 * `FunctionsHttpError` carries the non-2xx `Response` in `context`, so we read
 * its body to surface the function's own message (400/403/409 etc.). Relay and
 * fetch errors are transport-level (the function was unreachable), so they map
 * to a generic message with no status.
 */
export async function toInviteMemberError(
  error: unknown,
): Promise<InviteMemberError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    let body: unknown;
    try {
      body = await error.context.json();
    } catch {
      // Non-JSON / empty body — fall back to the status default below.
      body = undefined;
    }
    return new InviteMemberError(messageFromBody(body, status), status);
  }

  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
    return new InviteMemberError(defaultInviteErrorMessage(undefined));
  }

  if (error instanceof Error) {
    return new InviteMemberError(error.message);
  }

  return new InviteMemberError(defaultInviteErrorMessage(undefined));
}

/* ------------------------------------------------------------------------- */
/* Hooks                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * List the members of an organization (Requirements 8.1, 8.4). RLS scopes the
 * result to organizations the signed-in admin owns, so no owner filter is
 * applied here — an org the caller does not own simply yields an empty list.
 *
 * Rows are ordered newest-invited-first so a freshly invited member surfaces at
 * the top of the list after the invite mutation invalidates the cache
 * (Requirement 7.6). The query is disabled until a non-empty `orgId` is
 * provided, so the Org_Detail_View can call it before the route param resolves.
 */
export function useMembers(
  orgId: string,
): UseQueryResult<OrganizationMember[], Error> {
  return useQuery<OrganizationMember[], Error>({
    queryKey: memberKeys.list(orgId),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", orgId)
        .order("invited_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });
}

/**
 * Invite a member to an organization by email (Requirements 7.1, 7.6, 9.4).
 *
 * The invitation is created exclusively through the `invite-member` Edge
 * Function: `supabase.functions.invoke` forwards the caller's session JWT in the
 * `Authorization` header, which the function uses to verify ownership before its
 * privileged insert. The request body is `{ organizationId, email }` per the
 * design's API contract.
 *
 * Edge Function rejections (400 validation, 401 session, 403 not-owner, 409
 * duplicate) are normalized to {@link InviteMemberError} carrying the status and
 * a presentable message, so the invite form can surface the cause rather than a
 * generic failure.
 *
 * On success both caches are invalidated:
 *   - `['members', orgId]` so the invited member appears in the list (Req 7.6),
 *   - `['organizations']` so the directory's member count for the org increases
 *     by exactly one after refetch (Req 9.4).
 */
export function useInviteMember(
  orgId: string,
): UseMutationResult<OrganizationMember, InviteMemberError, InviteMemberInput> {
  const queryClient = useQueryClient();

  return useMutation<OrganizationMember, InviteMemberError, InviteMemberInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<InviteMemberResponse>(
        INVITE_FUNCTION_NAME,
        { body: { organizationId: orgId, email: input.email } },
      );

      if (error) {
        throw await toInviteMemberError(error);
      }

      if (!data?.member) {
        // 2xx without the expected payload — treat as a failure rather than
        // returning an undefined member to the form.
        throw new InviteMemberError(defaultInviteErrorMessage(undefined));
      }

      return data.member;
    },
    onSuccess: () => {
      // Req 7.6: refresh this org's members list so the invitee appears.
      void queryClient.invalidateQueries({ queryKey: memberKeys.list(orgId) });
      // Req 9.4: refresh the directory so the org's member count goes up by one.
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}
