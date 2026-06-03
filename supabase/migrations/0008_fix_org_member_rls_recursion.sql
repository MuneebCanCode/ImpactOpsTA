-- Migration: 0008_fix_org_member_rls_recursion
-- Purpose: Fix infinite recursion in RLS policies caused by circular references
--          between organizations and organization_members policies.
--
-- Problem:
--   organizations_select_as_member (on organizations) queries organization_members
--   organization_members_select_owned_org (on organization_members) queries organizations
--   → infinite recursion (Postgres error 42P17)
--
-- Fix:
--   Rewrite organizations_select_as_member to use user_id = auth.uid() directly
--   on organization_members instead of going through the profiles email lookup.
--   Accepted members have user_id set, so this is a direct, non-recursive check.
--
--   Also rewrite organization_members_select_own_invite (from migration 0004)
--   to use user_id = auth.uid() when available, with email fallback only for
--   the pending (user_id IS NULL) case — avoiding the profiles subquery recursion.

-- ---------------------------------------------------------------------------
-- Fix: organizations_select_as_member — use user_id directly
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select_as_member on public.organizations;
create policy organizations_select_as_member
  on public.organizations
  for select
  to authenticated
  using (
    id in (
      select organization_id
      from public.organization_members
      where user_id = auth.uid()
        and status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Fix: organization_members_select_own_invite — avoid profiles subquery
-- ---------------------------------------------------------------------------
-- For accepted members (user_id set): match directly by user_id.
-- For pending invites (user_id NULL): match by email via profiles.
-- Split into two separate permissive policies (Postgres ORs them).

drop policy if exists organization_members_select_own_invite on public.organization_members;

-- Policy 1: accepted member can read their own row by user_id (no subquery)
create policy organization_members_select_by_user_id
  on public.organization_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- Policy 2: invited (user_id NULL) user can read their pending row by email
create policy organization_members_select_pending_invite
  on public.organization_members
  for select
  to authenticated
  using (
    user_id is null
    and email = (
      select email from public.profiles where id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Fix: organization_members_update_own_invite — use user_id when possible
-- ---------------------------------------------------------------------------
-- The update happens while user_id is still NULL (acceptance moment), so we
-- must still use the email-based check for USING. But we drop the old policy
-- and keep the 0005 version which already uses id = id for WITH CHECK.
-- No change needed here — 0005 policy is already correct.
