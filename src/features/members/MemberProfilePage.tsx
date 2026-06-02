import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Mail, Users } from "lucide-react";

import { QueryState } from "@/components/state/QueryState";
import { OrgTypeBadge } from "@/features/organizations/OrgTypeBadge";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Organization, OrganizationMember } from "@/types/database";

/**
 * Member profile page (Requirement: role-based routing).
 *
 * Shown to users who signed in as a member (is_admin = false). Displays their
 * membership details — the organization they belong to, their status, and join
 * date — without offering any admin-only actions such as "Create organization".
 *
 * Data: queries `organization_members` joined with `organizations` for the
 * member's active row. The RLS policies introduced in migration 0004 and 0006
 * allow an authenticated user to read their own member row (by email match) and
 * the associated organization row (via the organizations_select_as_member policy).
 */

/* ------------------------------------------------------------------------- */
/* Query                                                                    */
/* ------------------------------------------------------------------------- */

/** Shape returned by the two-step query. */
type MemberWithOrg = OrganizationMember & {
  organizations: Organization;
};

const MEMBER_PROFILE_KEY = "memberProfile" as const;

/**
 * Fetch the signed-in member's active membership row, then fetch the org
 * separately by id. Using two queries avoids the circular RLS subquery issue
 * that occurs when joining organization_members → organizations while both
 * tables have policies that reference each other.
 */
function useMemberProfile(email: string) {
  return useQuery<MemberWithOrg | null, Error>({
    queryKey: [MEMBER_PROFILE_KEY, email] as const,
    enabled: Boolean(email),
    queryFn: async () => {
      // Step 1: get the member row by email.
      const { data: member, error: memberError } = await supabase
        .from("organization_members")
        .select("*")
        .eq("email", email)
        .eq("status", "active")
        .maybeSingle();

      if (memberError) throw memberError;
      if (!member) return null;

      // Step 2: get the org by id. The organizations_select_as_member RLS
      // policy allows this because the active member row now exists.
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", member.organization_id)
        .maybeSingle();

      if (orgError) throw orgError;
      if (!org) return null;

      return { ...member, organizations: org } as MemberWithOrg;
    },
  });
}

/* ------------------------------------------------------------------------- */
/* Page                                                                     */
/* ------------------------------------------------------------------------- */

export function MemberProfilePage() {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const query = useMemberProfile(email);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Membership</h1>

      <QueryState
        query={query}
        isEmpty={(data) => data === null || data === undefined}
        empty={
          <div
            data-query-state="empty"
            className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            No active membership found for{" "}
            <span className="font-medium">{email}</span>.
          </div>
        }
      >
        {(membership) => <MembershipCard membership={membership!} />}
      </QueryState>
    </div>
  );
}

export default MemberProfilePage;

/* ------------------------------------------------------------------------- */
/* Membership card                                                          */
/* ------------------------------------------------------------------------- */

function MembershipCard({ membership }: { membership: MemberWithOrg }) {
  const { organizations: org } = membership;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      {/* Card header: org name + type badge */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight">{org.name}</h2>
          <OrgTypeBadge type={org.type} />
        </div>
        {org.school_district && (
          <p className="mt-1 text-sm text-muted-foreground">
            {org.school_district}
          </p>
        )}
      </div>

      {/* Card body: membership details */}
      <dl className="divide-y divide-border">
        <DetailRow icon={<Mail className="h-4 w-4" aria-hidden="true" />} label="Email">
          {membership.email}
        </DetailRow>

        <DetailRow icon={<Users className="h-4 w-4" aria-hidden="true" />} label="Status">
          <StatusBadge status={membership.status} />
        </DetailRow>

        <DetailRow
          icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
          label="Organization created"
        >
          {formatDate(org.created_at)}
        </DetailRow>

        {membership.joined_at && (
          <DetailRow
            icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
            label="Joined"
          >
            {formatDate(membership.joined_at)}
          </DetailRow>
        )}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Presentational helpers                                                   */
/* ------------------------------------------------------------------------- */

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-6 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        isActive
          ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30"
          : "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30",
      )}
    >
      {isActive ? "Active" : "Invited"}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
