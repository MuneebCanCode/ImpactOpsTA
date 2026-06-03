-- Migration: 0001_init_schema
-- Purpose: Initial relational schema for the Admin Organization Dashboard.
--          Defines enums, the profiles / organizations / organization_members
--          tables, and all referential, domain, and uniqueness constraints.
--
-- The database is the security boundary and source of integrity: enums,
-- foreign keys, CHECK constraints, and the per-organization unique email
-- constraint enforce invariants regardless of which code path writes.
--
-- RLS policies and the profile trigger are intentionally defined in separate,
-- independently reviewable migrations (0002_rls_policies.sql,
-- 0003_profile_trigger.sql).
--
-- Requirements: 5.6, 6.4, 7.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 17.1

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Postgres has no "CREATE TYPE IF NOT EXISTS", so each enum is guarded so the
-- migration is safe to re-run during development.

-- org_type: classification of an Organization (Requirement 10.5, 6).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_type') then
    create type public.org_type as enum ('school', 'nonprofit', 'business');
  end if;
end
$$;

-- member_status: lifecycle of a Member (Requirement 10.6).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('invited', 'active');
  end if;
end
$$;

-- member_role: in-organization role (Requirement 17.1).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('admin', 'member');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Table: profiles
-- ---------------------------------------------------------------------------
-- One row per authenticated user. The id is both PK and FK to auth.users so a
-- profile is inseparable from its user. Populated by the handle_new_user
-- trigger (migration 0003). is_admin defaults to true: every signed-up user is
-- recognized as an Admin (Requirement 1.5).
create table if not exists public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text        not null,
  full_name  text,
  is_admin   boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: organizations
-- ---------------------------------------------------------------------------
-- A tenant entity owned by the creating Admin. owner_id is the anchor for
-- tenant isolation (RLS keys on it). The school_requires_district CHECK is the
-- server-side enforcement of the type-specific rule for School organizations.
-- Requirements: 5.6, 6.4, 10.1, 10.4, 10.5
create table if not exists public.organizations (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null check (length(trim(name)) > 0),
  type            public.org_type not null,                                   -- Req 10.5
  school_district text,                                                       -- nullable; required only when type = 'school'
  owner_id        uuid        not null references auth.users (id) on delete cascade, -- Req 10.4
  created_at      timestamptz not null default now(),                         -- Req 10.1, 5.6
  -- Server-side type-specific validation: a School must have a non-empty
  -- school_district; non-School types may leave it null (Requirement 6.4).
  constraint school_requires_district
    check (type <> 'school' or (school_district is not null and length(trim(school_district)) > 0))
);

-- ---------------------------------------------------------------------------
-- Table: organization_members
-- ---------------------------------------------------------------------------
-- An Invitation/Member record. user_id is nullable until the invited person
-- accepts and is linked to an auth user (Requirement 16.1). status defaults to
-- 'invited' and role to 'member'. The UNIQUE(organization_id, email) constraint
-- is the ultimate guarantee against duplicate members within an organization,
-- handling races the Edge Function pre-check cannot (Requirement 7.5, 10.7).
-- Requirements: 7.5, 10.2, 10.3, 10.6, 10.7, 17.1
create table if not exists public.organization_members (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade, -- Req 10.3
  user_id         uuid        references auth.users (id) on delete set null,  -- nullable until acceptance; Req 10.2, 16.1
  email           text        not null,
  status          public.member_status not null default 'invited',           -- Req 10.6
  role            public.member_role   not null default 'member',            -- Req 10.2, 17.1
  invited_at      timestamptz not null default now(),
  joined_at       timestamptz,                                                -- nullable until active
  constraint uq_member_email_per_org unique (organization_id, email)          -- Req 10.7, 7.5
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Support the directory query (organizations owned by an admin) and the
-- per-organization member list / member-count query.
create index if not exists idx_organizations_owner_id
  on public.organizations (owner_id);

create index if not exists idx_organization_members_organization_id
  on public.organization_members (organization_id);
