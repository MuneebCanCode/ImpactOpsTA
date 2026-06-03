-- Migration: 0009_fix_recursion_with_function
-- Purpose: Eliminate infinite recursion in RLS policies by using a
--          SECURITY DEFINER function that bypasses RLS when checking membership.
--
-- The recursion chain was:
--   organizations SELECT policy → queries organization_members
--   organization_members SELECT policy → queries organizations
--   → infinite loop (error 42P17)
--
-- Solution: wrap the membership check in a SECURITY DEFINER function.
-- Functions marked SECURITY DEFINER run as the function owner (superuser),
-- which bypasses RLS entirely. This breaks the recursion without exposing data
-- because the function itself is narrowly scoped to return only a boolean.

-- ---------------------------------------------------------------------------
-- Helper function: check if auth.uid() is an active member of an org
-- ---------------------------------------------------------------------------
create or replace function public.is_active_member_of(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Recreate organizations_select_as_member using the function
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select_as_member on public.organizations;
create policy organizations_select_as_member
  on public.organizations
  for select
  to authenticated
  using (public.is_active_member_of(id));

-- ---------------------------------------------------------------------------
-- Clean up the two split policies from migration 0008 and restore one clean
-- policy for members reading their own organization_members row.
-- ---------------------------------------------------------------------------
drop policy if exists organization_members_select_by_user_id on public.organization_members;
drop policy if exists organization_members_select_pending_invite on public.organization_members;
drop policy if exists organization_members_select_own_invite on public.organization_members;

-- Single policy: a user can read organization_members rows where:
--   - they are the linked user (accepted member), OR
--   - the row is a pending invite for their email (not yet accepted)
create policy organization_members_select_own_invite
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      user_id is null
      and email = (select email from public.profiles where id = auth.uid())
    )
  );
