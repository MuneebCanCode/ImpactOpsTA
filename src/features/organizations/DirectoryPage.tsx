import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Users } from "lucide-react";

import { QueryState } from "@/components/state/QueryState";
import { cn } from "@/lib/utils";
import { CreateOrgDialog } from "@/features/organizations/CreateOrgDialog";
import { DirectoryFilters } from "@/features/organizations/DirectoryFilters";
import { OrgTypeBadge } from "@/features/organizations/OrgTypeBadge";
import {
  useOrganizations,
  type OrganizationFilters,
  type OrganizationWithMemberCount,
} from "@/features/organizations/hooks";

/**
 * The Organization Directory (Requirements 9, 12).
 *
 * Lists every organization owned by the signed-in admin (RLS scopes the read to
 * the owner, so no client-side owner filter is needed — Requirement 9.1) and is
 * the single place the directory's State_Pattern is wired up. The page owns the
 * {@link OrganizationFilters} state and feeds it both to {@link DirectoryFilters}
 * (the controlled search + type-filter bar) and to {@link useOrganizations}, so
 * each search/type combination participates in the React Query key and is cached
 * independently.
 *
 * Rendering is delegated entirely to the shared {@link QueryState}, which renders
 * exactly one of:
 *   - a loading state while the query is pending          (Requirement 12.1)
 *   - an error state with a retry control on failure      (Requirement 12.3)
 *   - an empty state when there are no rows                (Requirements 9.7, 12.2)
 *   - the directory rows otherwise
 *
 * The empty branch is context-aware: with no active filters it invites the admin
 * to create their first organization and surfaces the {@link CreateOrgDialog}
 * (Requirement 9.7); with an active search/type filter it instead reports that
 * no organizations match (Requirement 18.3).
 *
 * Each row shows the organization name, its type badge, the member count, and the
 * creation date (Requirement 9.2). Rows are native buttons, so selecting one with
 * a pointer, Enter, or Space navigates to that organization's detail view
 * (Requirement 9.5) with full keyboard accessibility.
 */
export function DirectoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<OrganizationFilters>({});

  const organizationsQuery = useOrganizations(filters);

  // "Active filters" decides which empty message to show: an invitation to create
  // the first org (no filters, Req 9.7) vs. a "no matches" notice (Req 18.3).
  const hasActiveFilters = Boolean(filters.search?.trim() || filters.type);

  const goToOrganization = (orgId: string) => {
    navigate(`/orgs/${orgId}`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="text-sm text-muted-foreground">
            Organizations you manage.
          </p>
        </div>

        {/* Create-org entry point in the page header (Req 5). */}
        <CreateOrgDialog />
      </header>

      <DirectoryFilters value={filters} onChange={setFilters} />

      <QueryState
        query={organizationsQuery}
        empty={
          <DirectoryEmptyState hasActiveFilters={hasActiveFilters} />
        }
      >
        {(organizations) => (
          <ul className="space-y-2" data-testid="organization-list">
            {organizations.map((organization) => (
              <li key={organization.id}>
                <OrganizationRow
                  organization={organization}
                  onSelect={() => goToOrganization(organization.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

type OrganizationRowProps = {
  organization: OrganizationWithMemberCount;
  /** Invoked when the row is selected via pointer or keyboard. */
  onSelect: () => void;
};

/**
 * A single directory row (Requirements 9.2, 9.5).
 *
 * Rendered as a native `<button>` so it is focusable and responds to Enter and
 * Space without any custom key handling, keeping row navigation fully keyboard
 * accessible. The row surfaces the four required pieces of information: the
 * organization name, its {@link OrgTypeBadge}, the member count, and the
 * formatted creation date.
 */
function OrganizationRow({ organization, onSelect }: OrganizationRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="organization-row"
      className={cn(
        "group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{organization.name}</span>
          <OrgTypeBadge type={organization.type} />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {formatMemberCount(organization.memberCount)}
          </span>
          <span>Created {formatCreatedAt(organization.created_at)}</span>
        </div>
      </div>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}

type DirectoryEmptyStateProps = {
  /** Whether a search term or type filter is currently applied. */
  hasActiveFilters: boolean;
};

/**
 * The directory's empty state. With active filters it reports that nothing
 * matches (Requirement 18.3); otherwise it invites the admin to create their
 * first organization and surfaces the {@link CreateOrgDialog} (Requirement 9.7).
 */
function DirectoryEmptyState({ hasActiveFilters }: DirectoryEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <div
        data-query-state="empty"
        data-testid="directory-empty-no-matches"
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center"
      >
        <p className="text-sm font-medium">No organizations match your filters.</p>
        <p className="text-sm text-muted-foreground">
          Try a different name or type.
        </p>
      </div>
    );
  }

  return (
    <div
      data-query-state="empty"
      data-testid="directory-empty-create-first"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center"
    >
      <Plus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">No organizations yet</p>
        <p className="text-sm text-muted-foreground">
          Create your first organization to get started.
        </p>
      </div>
      <CreateOrgDialog />
    </div>
  );
}

/**
 * Format the member count with correct singular/plural wording.
 */
function formatMemberCount(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

/**
 * Module-level formatter so the `Intl.DateTimeFormat` instance is created once
 * rather than per render. Produces a readable medium date (e.g. "Jan 5, 2024").
 */
const CREATED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Format an ISO timestamp into a readable creation date (Requirement 9.2).
 * Falls back to the raw value if the timestamp cannot be parsed, so a row never
 * renders a misleading "Invalid Date".
 */
function formatCreatedAt(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }
  return CREATED_AT_FORMATTER.format(parsed);
}

export default DirectoryPage;
