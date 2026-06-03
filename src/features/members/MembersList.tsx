import { CheckCircle2, Mail, MailCheck, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { QueryState } from "@/components/state/QueryState";
import { useMembers } from "@/features/members/hooks";
import type { MemberStatus, OrganizationMember } from "@/types/database";

/**
 * The members list for the Org_Detail_View (Requirement 8).
 *
 * Loads an organization's members through React Query via {@link useMembers}
 * (Requirement 8.4 — no effect-based fetching) and renders them through the
 * shared {@link QueryState} component so loading, error, and empty states are
 * presented with the same State_Pattern used elsewhere (Requirement 12.4). Each
 * rendered row shows the member's email (Requirement 8.1) alongside a status
 * indicator that reads as either "invited" or "active" (Requirement 8.2). When
 * the organization has no members an empty state is shown instead of an empty
 * list (Requirement 8.3).
 *
 * The component is presentational beyond the single `useMembers(orgId)` read:
 * it takes the organization id and renders, leaving data fetching, caching, and
 * invalidation to the hook layer.
 *
 * _Requirements: 8.1, 8.2, 8.3_
 */

type MembersListProps = {
  /** The organization whose members should be listed. */
  orgId: string;
  /** Optional extra classes merged onto the list container. */
  className?: string;
};

/**
 * Per-status visual treatment for the status indicator. Each status maps to its
 * own color palette AND its own icon so the two states are distinguishable both
 * by color and by shape (keeping the badge legible for color-blind users), in
 * the same spirit as {@link OrgTypeBadge}. `invited` reads as a pending state
 * (amber) and `active` as a confirmed/positive state (emerald). Explicit
 * `dark:` variants keep both legible in dark mode.
 */
const STATUS_STYLES: Record<
  MemberStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  invited: {
    label: "Invited",
    icon: MailCheck,
    className:
      "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30",
  },
  active: {
    label: "Active",
    icon: CheckCircle2,
    className:
      "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30",
  },
};

/**
 * Small badge rendering a member's status as either "invited" or "active"
 * (Requirement 8.2).
 */
function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const { label, icon: Icon, className } = STATUS_STYLES[status];
  return (
    <span
      data-member-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/** A single member row: email on the left, status indicator on the right. */
function MemberRow({ member }: { member: OrganizationMember }) {
  return (
    <li
      data-member-id={member.id}
      className="flex items-center justify-between gap-3 px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Mail
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        {/* min-w-0 ensures the flex child can shrink below its content size
            so long emails truncate rather than pushing the badge off-screen */}
        <span className="min-w-0 truncate text-sm font-medium">{member.email}</span>
      </div>
      {/* shrink-0 keeps the badge fully visible regardless of email length */}
      <div className="shrink-0">
        <MemberStatusBadge status={member.status} />
      </div>
    </li>
  );
}

/** Empty state shown when the organization has no members (Requirement 8.3). */
function MembersEmptyState() {
  return (
    <div
      data-query-state="empty"
      className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground"
    >
      <UserPlus className="h-6 w-6" aria-hidden="true" />
      <p className="text-sm">
        No members yet. Invite someone to get started.
      </p>
    </div>
  );
}

export function MembersList({ orgId, className }: MembersListProps) {
  const query = useMembers(orgId);

  return (
    <QueryState query={query} empty={<MembersEmptyState />}>
      {(members) => (
        <ul
          data-testid="members-list"
          className={cn("divide-y divide-border rounded-md border", className)}
        >
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      )}
    </QueryState>
  );
}

export default MembersList;
