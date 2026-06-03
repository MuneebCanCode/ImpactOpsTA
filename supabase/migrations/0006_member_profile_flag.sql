-- Migration: 0006_member_profile_flag
-- Purpose: Mark invited members as non-admin when they accept an invitation,
--          and allow members to read the organization they belong to.
--
-- When a user accepts an invitation, the `organization_members` row is updated
-- with their `user_id` (previously NULL). A trigger fires AFTER that update and
-- sets `profiles.is_admin = false` for that user so the post-auth routing logic
-- can distinguish members from org owners (who have `is_admin = true` from the
-- `handle_new_user` trigger in 0003).
--
-- The trigger function uses SECURITY DEFINER so it can write to `profiles` even
-- though the calling user does not own the profile row. It is scoped narrowly:
-- it only fires when `user_id` changes from NULL to a non-null value, preventing
-- spurious or duplicate updates on unrelated updates to the row.
--
-- An additional SELECT policy on `organizations` lets active members read the
-- organization they belong to (needed for the MemberProfilePage join query).
-- The policy is additive: the existing `organizations_select_own` policy already
-- lets owners read their orgs; this policy extends visibility to members via
-- their `organization_members` row.

-- ---------------------------------------------------------------------------
-- Trigger function: set is_admin = false when a member accepts an invitation
-- ---------------------------------------------------------------------------
create or replace function public.handle_member_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when user_id transitions from NULL to a non-null value.
  -- This is the acceptance moment: the invitee linked their account.
  if (old.user_id is null and new.user_id is not null) then
    update public.profiles
      set is_admin = false
      where id = new.user_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: fire AFTER UPDATE on organization_members
-- ---------------------------------------------------------------------------
drop trigger if exists on_member_acceptance on public.organization_members;
create trigger on_member_acceptance
  after update on public.organization_members
  for each row
  execute procedure public.handle_member_acceptance();

-- ---------------------------------------------------------------------------
-- RLS policy: allow a member to read an org they belong to
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select_as_member on public.organizations;
create policy organizations_select_as_member
  on public.organizations for select to authenticated
  using (
    id in (
      select organization_id from public.organization_members
      where email = (select email from public.profiles where id = auth.uid())
      and status = 'active'
    )
  );
