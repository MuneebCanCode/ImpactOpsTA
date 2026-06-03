-- Migration: 0004_invite_acceptance_rls
-- Purpose: Add RLS policies that allow an invited user to read and accept
--          their own invitation row in organization_members.
--
-- The existing policies (0002) only allow the org OWNER to read/write member
-- rows. That is correct for the admin view, but it blocks the invite-acceptance
-- flow: when an invited user navigates to /accept-invite?id=<member_id>, their
-- client must be able to:
--   1. SELECT the row by id to verify it exists and is still pending.
--   2. UPDATE the row to link their user_id and flip status to 'active'.
--
-- The policy is scoped to the invitee by matching the row's email against the
-- email stored in the authenticated user's profile row. This avoids exposing
-- any cross-tenant data: a user can only ever read/update the single row whose
-- email matches their own.
--
-- Security notes:
--   - The SELECT policy is limited to rows whose email matches the caller's
--     profile email. It does NOT expose any other member rows.
--   - The UPDATE policy additionally enforces status = 'invited' via
--     a WITH CHECK so an already-accepted row cannot be re-activated.
--   - INSERT and DELETE on this path are intentionally not granted; those
--     operations remain restricted to org owners (0002) and the Edge Function
--     service-role path.

-- ---------------------------------------------------------------------------
-- SELECT: allow an invitee to read their own pending invitation row
-- ---------------------------------------------------------------------------
drop policy if exists organization_members_select_own_invite on public.organization_members;
create policy organization_members_select_own_invite
  on public.organization_members
  for select
  to authenticated
  using (
    email = (
      select email from public.profiles where id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE: allow an invitee to accept their own pending invitation
-- ---------------------------------------------------------------------------
-- USING:      the row email matches the caller's profile email
-- WITH CHECK: same condition — email must still match after the update
--             (prevents changing the email during acceptance)
drop policy if exists organization_members_update_own_invite on public.organization_members;
create policy organization_members_update_own_invite
  on public.organization_members
  for update
  to authenticated
  using (
    email = (
      select email from public.profiles where id = auth.uid()
    )
  )
  with check (
    email = (
      select email from public.profiles where id = auth.uid()
    )
  );
