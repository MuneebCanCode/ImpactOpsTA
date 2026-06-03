-- Migration: 0002_rls_policies
-- Purpose: Enable Row Level Security and define the tenant-isolation policies
--          for profiles, organizations, and organization_members.
--
-- This migration is THE security boundary. Postgres + RLS is the primary
-- authority on tenant isolation: even if the client is compromised or a query
-- is hand-crafted with the public anon key, these policies guarantee an admin
-- can only ever read or mutate rows they own. Ownership is the sole determinant
-- of visibility, keyed on auth.uid() (the authenticated user's id from the JWT).
--
-- The service-role key used by the invite-member Edge Function BYPASSES RLS, so
-- that path performs its own explicit ownership check before any privileged
-- write (Requirement 11.6). No client write occurs outside these policies.
--
-- Idempotency: ENABLE ROW LEVEL SECURITY is a no-op if already enabled, and each
-- policy is dropped (IF EXISTS) before being recreated so the migration is safe
-- to re-run during development. Policies are scoped TO authenticated; auth.uid()
-- is null for the anon role, so unauthenticated requests are denied regardless.
--
-- Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6

-- ---------------------------------------------------------------------------
-- Enable RLS on every table storing Organization, Member, or profile data
-- ---------------------------------------------------------------------------
-- Requirement 11.1: RLS is enabled on all three tables. Once enabled with no
-- permissive policy for a given command, that command is denied by default.
alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

-- ---------------------------------------------------------------------------
-- Policies: organizations
-- ---------------------------------------------------------------------------
-- An organization is owned by exactly one admin (owner_id). All access is keyed
-- directly on that column.
--   SELECT  -> Req 11.2: an admin sees only organizations they own.
--   UPDATE/DELETE -> Req 11.4: an admin cannot read or write another admin's org.
--   INSERT  -> an admin cannot create an org owned by someone else.
-- The UPDATE policy carries WITH CHECK in addition to USING so an admin cannot
-- transfer ownership of their org to a different admin by rewriting owner_id
-- (defense in depth for isolation).

drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own
  on public.organizations
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists organizations_insert_own on public.organizations;
create policy organizations_insert_own
  on public.organizations
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists organizations_update_own on public.organizations;
create policy organizations_update_own
  on public.organizations
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists organizations_delete_own on public.organizations;
create policy organizations_delete_own
  on public.organizations
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Policies: organization_members
-- ---------------------------------------------------------------------------
-- A member row is visible/mutable only to the admin who owns the parent
-- organization. Membership is therefore expressed transitively: the member's
-- organization_id must belong to an organization owned by the caller.
--   SELECT  -> Req 11.3: an admin sees only members of organizations they own.
--   UPDATE/DELETE -> Req 11.5: an admin cannot read or write members of another
--                    admin's org.
--   INSERT  -> an admin can only add members to organizations they own.
-- The subquery itself runs under the organizations policies above, so it
-- resolves only to org ids the caller owns. WITH CHECK on UPDATE prevents
-- reparenting a member row into an org the caller does not own.

drop policy if exists organization_members_select_owned_org on public.organization_members;
create policy organization_members_select_owned_org
  on public.organization_members
  for select
  to authenticated
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

drop policy if exists organization_members_insert_owned_org on public.organization_members;
create policy organization_members_insert_owned_org
  on public.organization_members
  for insert
  to authenticated
  with check (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

drop policy if exists organization_members_update_owned_org on public.organization_members;
create policy organization_members_update_owned_org
  on public.organization_members
  for update
  to authenticated
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

drop policy if exists organization_members_delete_owned_org on public.organization_members;
create policy organization_members_delete_owned_org
  on public.organization_members
  for delete
  to authenticated
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: profiles
-- ---------------------------------------------------------------------------
-- A profile is private to its own user. id is both the PK and the auth.users
-- FK, so identity is the access key.
--   SELECT/UPDATE -> a user reads and edits only their own profile.
-- No INSERT policy is defined on purpose: profile rows are created exclusively
-- by the SECURITY DEFINER handle_new_user trigger (migration 0003), so client
-- inserts must be denied. No DELETE policy is defined: profile removal happens
-- via ON DELETE CASCADE from auth.users, never directly from the client.

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
