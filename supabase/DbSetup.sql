-- =============================================================================
-- Impact Operations TA — Full Database Schema
-- =============================================================================
-- Single consolidated script combining all migrations (0001–0009).
-- Run this once against a fresh Supabase project to recreate the complete
-- schema, RLS policies, triggers, and helper functions.
--
-- Usage (Supabase SQL Editor):
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--
-- Usage (Supabase CLI):
--   psql "$DATABASE_URL" -f supabase/schema.sql
--
-- This script is fully idempotent — safe to re-run on an existing database.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_type') THEN
    CREATE TYPE public.org_type AS ENUM ('school', 'nonprofit', 'business');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
    CREATE TYPE public.member_status AS ENUM ('invited', 'active');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE public.member_role AS ENUM ('admin', 'member');
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- TABLES
-- -----------------------------------------------------------------------------

-- profiles: one row per authenticated user, auto-created by trigger below.
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  full_name  TEXT,
  is_admin   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- organizations: tenant entity owned by an admin.
CREATE TABLE IF NOT EXISTS public.organizations (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT            NOT NULL CHECK (length(trim(name)) > 0),
  type            public.org_type NOT NULL,
  school_district TEXT,
  owner_id        UUID            NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT school_requires_district
    CHECK (type <> 'school' OR (school_district IS NOT NULL AND length(trim(school_district)) > 0))
);

-- organization_members: invitation/membership record.
CREATE TABLE IF NOT EXISTS public.organization_members (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID                 NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id         UUID                 REFERENCES auth.users (id) ON DELETE SET NULL,
  email           TEXT                 NOT NULL,
  status          public.member_status NOT NULL DEFAULT 'invited',
  role            public.member_role   NOT NULL DEFAULT 'member',
  invited_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  joined_at       TIMESTAMPTZ,
  CONSTRAINT uq_member_email_per_org UNIQUE (organization_id, email)
);


-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON public.organizations (owner_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id
  ON public.organization_members (organization_id);


-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — Enable on all tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- RLS POLICIES — profiles
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- -----------------------------------------------------------------------------
-- RLS POLICIES — organizations
-- -----------------------------------------------------------------------------

-- Admin: full access to own organizations
DROP POLICY IF EXISTS organizations_select_own ON public.organizations;
CREATE POLICY organizations_select_own
  ON public.organizations FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS organizations_insert_own ON public.organizations;
CREATE POLICY organizations_insert_own
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS organizations_update_own ON public.organizations;
CREATE POLICY organizations_update_own
  ON public.organizations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS organizations_delete_own ON public.organizations;
CREATE POLICY organizations_delete_own
  ON public.organizations FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Member: read the organization they actively belong to.
-- Uses is_active_member_of() SECURITY DEFINER function (defined below)
-- to avoid circular RLS recursion between organizations ↔ organization_members.
DROP POLICY IF EXISTS organizations_select_as_member ON public.organizations;
CREATE POLICY organizations_select_as_member
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_active_member_of(id));


-- -----------------------------------------------------------------------------
-- RLS POLICIES — organization_members
-- -----------------------------------------------------------------------------

-- Admin: full access to members of their own organizations
DROP POLICY IF EXISTS organization_members_select_owned_org ON public.organization_members;
CREATE POLICY organization_members_select_owned_org
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organization_members_insert_owned_org ON public.organization_members;
CREATE POLICY organization_members_insert_owned_org
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organization_members_update_owned_org ON public.organization_members;
CREATE POLICY organization_members_update_owned_org
  ON public.organization_members FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organization_members_delete_owned_org ON public.organization_members;
CREATE POLICY organization_members_delete_owned_org
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
  );

-- Invitee: read their own invitation row (pending or accepted)
DROP POLICY IF EXISTS organization_members_select_own_invite ON public.organization_members;
CREATE POLICY organization_members_select_own_invite
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    -- Accepted member: match directly by user_id (no subquery needed)
    user_id = auth.uid()
    OR
    -- Pending invite (user_id still NULL): match by email
    (
      user_id IS NULL
      AND email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Invitee: accept their own pending invitation
DROP POLICY IF EXISTS organization_members_update_own_invite ON public.organization_members;
CREATE POLICY organization_members_update_own_invite
  ON public.organization_members FOR UPDATE TO authenticated
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    id = id  -- allow the update; ownership already verified in USING clause
  );


-- -----------------------------------------------------------------------------
-- HELPER FUNCTION — break RLS recursion for member org lookup
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER bypasses RLS inside the function, breaking the circular
-- reference between organizations ↔ organization_members policies.

CREATE OR REPLACE FUNCTION public.is_active_member_of(org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;


-- -----------------------------------------------------------------------------
-- TRIGGER FUNCTION — auto-create profile on sign-up
-- -----------------------------------------------------------------------------
-- Fires AFTER INSERT on auth.users. Sets is_admin = true so every signed-up
-- user is treated as an admin by default.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    TRUE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------------
-- TRIGGER FUNCTION — set is_admin = false when a member accepts an invitation
-- -----------------------------------------------------------------------------
-- Fires AFTER UPDATE on organization_members when user_id transitions from
-- NULL to a non-null value (the acceptance moment).

CREATE OR REPLACE FUNCTION public.handle_member_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL) THEN
    UPDATE public.profiles
      SET is_admin = FALSE
      WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_acceptance ON public.organization_members;
CREATE TRIGGER on_member_acceptance
  AFTER UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_member_acceptance();


-- =============================================================================
-- Setup complete.
-- Next steps:
--   1. Deploy the Edge Function:  npx supabase functions deploy invite-member
--   2. Set the secret:            npx supabase secrets set SERVICE_ROLE_KEY=<key>
--   3. (Optional) Disable email confirmation in Auth settings for easier testing
-- =============================================================================
