import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, Users } from "lucide-react";

import { QueryState } from "@/components/state/QueryState";
import { InviteMemberForm } from "@/features/members/InviteMemberForm";
import { MembersList } from "@/features/members/MembersList";
import {
  useOrganization,
  type OrganizationWithMemberCount,
} from "@/features/organizations/hooks";
import { OrgTypeBadge } from "@/features/organizations/OrgTypeBadge";

/**
 * The Org_Detail_View (Requirements 8, 12.4).
 *
 * Composes the three building blocks for a single organization into one page:
 * the organization header (loaded via {@link useOrganization}), the members
 * list ({@link MembersList}), and the invite form ({@link InviteMemberForm}).
 *
 * Two independent React Query reads are in play, each presented with the SAME
 * shared {@link QueryState} State_Pattern (Requirement 12.4):
 *   - The organization header read is wrapped here. A pending read shows the
 *     loading state, a failed read shows an error + retry, and a successful
 *     read that resolves to `null` — the org does not exist or is not owned by
 *     the caller (RLS filters it out) — shows an informative not-found state
 *     rather than a blank page.
 *   - The members read is wrapped INSIDE {@link MembersList}, which already
 *     handles its own loading / error / empty states through `QueryState`
 *     (Requirements 8.1, 8.3). The empty members case is therefore handled by
 *     that component, not duplicated here.
 *
 * The invite form sits alongside the members list so an admin can grow the
 * organization without leaving the view; a successful invite invalidates the
 * members cache (handled in the hook layer) so the new member appears in the
 * adjacent list without a reload.
 *
 * A back link returns to the Directory so navigation is reversible without
 * relying on the browser's back button.
 *
 * The `orgId` is read from the route params (`/orgs/:orgId`). `useOrganization`
 * is disabled until a non-empty id is present, so a missing param resolves to
 * the not-found state rather than firing a malformed query.
 *
 * _Requirements: 8.1, 8.3, 12.4_
 */
export function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const organizationQuery = useOrganization(orgId ?? "");

  return (
    <div className="space-y-6">
      <BackToDirectoryLink />

      <QueryState
        query={organizationQuery}
        empty={<OrganizationNotFound />}
      >
        {(organization) =>
          // `null` is routed to the `empty` branch (OrganizationNotFound) by
          // QueryState's default isEmpty, so this is unreachable at runtime; the
          // guard narrows the type for the data view below.
          !organization ? (
            <OrganizationNotFound />
          ) : (
          <div className="space-y-8">
            <OrganizationHeader organization={organization} />

            <section
              aria-labelledby="members-heading"
              className="grid gap-6 lg:grid-cols-[1fr_22rem]"
            >
              <div className="space-y-3">
                <h2
                  id="members-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  Members
                </h2>
                <MembersList orgId={organization.id} />
              </div>

              {/* Invite form — full width on mobile, sidebar on large screens */}
              <aside className="space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  Invite a member
                </h2>
                <InviteMemberForm orgId={organization.id} />
              </aside>
            </section>
          </div>
          )
        }
      </QueryState>
    </div>
  );
}

/** A back link returning to the Directory (reversible navigation). */
function BackToDirectoryLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to organizations
    </Link>
  );
}

type OrganizationHeaderProps = {
  organization: OrganizationWithMemberCount;
};

/**
 * The organization header: name + type badge, the school district when present
 * (School organizations only), the member count, and the creation date.
 */
function OrganizationHeader({ organization }: OrganizationHeaderProps) {
  const schoolDistrict = organization.school_district?.trim();

  return (
    <header className="space-y-3 border-b border-border pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization.name}
        </h1>
        <OrgTypeBadge type={organization.type} />
      </div>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {schoolDistrict ? (
          <div className="inline-flex items-center gap-1.5">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <dt className="sr-only">School district</dt>
            <dd>{schoolDistrict}</dd>
          </div>
        ) : null}

        <div className="inline-flex items-center gap-1.5">
          <Users className="h-4 w-4" aria-hidden="true" />
          <dt className="sr-only">Member count</dt>
          <dd>{formatMemberCount(organization.memberCount)}</dd>
        </div>

        <div className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <dt className="sr-only">Created</dt>
          <dd>Created {formatCreatedAt(organization.created_at)}</dd>
        </div>
      </dl>
    </header>
  );
}

/**
 * Shown when the organization read succeeds but resolves to `null` — the org
 * does not exist or is owned by a different admin (RLS filters it out). Offers
 * a clear path back to the Directory rather than rendering a blank page.
 */
function OrganizationNotFound() {
  return (
    <div
      data-query-state="empty"
      data-testid="organization-not-found"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center"
    >
      <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Organization not found</p>
        <p className="text-sm text-muted-foreground">
          It may have been removed, or you may not have access to it.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Back to organizations
      </Link>
    </div>
  );
}

/** Format the member count with correct singular/plural wording. */
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
 * Format an ISO timestamp into a readable creation date. Falls back to the raw
 * value if the timestamp cannot be parsed, so the header never renders a
 * misleading "Invalid Date".
 */
function formatCreatedAt(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }
  return CREATED_AT_FORMATTER.format(parsed);
}

export default OrgDetailPage;
