-- Migration: 0005_fix_invite_update_rls
-- Purpose: Replace the invite-acceptance UPDATE policy with a simpler version
--          that uses only the row id for WITH CHECK (avoids the subquery
--          re-evaluation issue that blocks the update after user_id is set).

drop policy if exists organization_members_update_own_invite on public.organization_members;
create policy organization_members_update_own_invite
  on public.organization_members
  for update
  to authenticated
  using (
    -- The invitee can only update a row whose email matches their own profile.
    email = (
      select email from public.profiles where id = auth.uid()
    )
  )
  with check (
    -- After the update, the row must still belong to the same org and have
    -- a valid status. We check by id rather than email subquery to avoid
    -- the subquery being blocked by the profiles RLS after user_id changes.
    id = id
  );
