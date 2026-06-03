-- Migration: 0007_backfill_member_is_admin
-- Purpose: Backfill is_admin = false for users who accepted an invitation
--          before the handle_member_acceptance trigger existed (migration 0006).
--
-- A user is a "member" (not an admin) if:
--   - They have an active organization_members row linking their user_id, AND
--   - They do not own any organizations themselves.
--
-- This is a one-time data fix. The trigger in 0006 handles all future
-- acceptances automatically.

update public.profiles
set is_admin = false
where id in (
  -- Users who are active members of an org
  select user_id
  from public.organization_members
  where user_id is not null
    and status = 'active'
)
and id not in (
  -- Exclude users who own at least one org (they are admins)
  select owner_id
  from public.organizations
);
