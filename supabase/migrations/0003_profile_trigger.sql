-- Migration: 0003_profile_trigger
-- Purpose: Automatically create a profiles row for every new auth.users row.
--          Defines the SECURITY DEFINER handle_new_user() function and the
--          on_auth_user_created AFTER INSERT trigger.
--
-- Why this matters: the trigger fires AFTER INSERT on auth.users *inside the
-- same transaction* as user creation. If the function raises (a constraint
-- violation, a NOT NULL failure, etc.), the exception aborts the transaction
-- and Supabase Auth surfaces a "Database error saving new user" response to the
-- client. This is exactly what makes a profile-creation failure DETECTABLE
-- rather than silent (Requirement 1.9): the function never swallows exceptions.
--
-- is_admin is set to true so every signed-up user is recognized as an Admin
-- (Requirement 1.5). The profiles.is_admin column also defaults to true, so the
-- invariant holds even if the value were omitted.
--
-- This trigger is defined in its own migration, separate from the schema
-- (0001_init_schema.sql) and RLS policies (0002_rls_policies.sql), so each
-- concern can be reviewed independently.
--
-- Requirements: 1.5, 1.9

-- ---------------------------------------------------------------------------
-- Function: public.handle_new_user
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the function runs with the privileges of its owner and
-- can insert into public.profiles regardless of the (internal) auth context
-- that fired the trigger. search_path is pinned to public to prevent search
-- path hijacking, a standard hardening step for SECURITY DEFINER functions.
--
-- The function performs a plain INSERT with no exception handler: any failure
-- propagates out of the trigger and aborts the auth.users insert (Req 1.9).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    true  -- Req 1.5: every signed-up user is recognized as an Admin
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: on_auth_user_created
-- ---------------------------------------------------------------------------
-- AFTER INSERT FOR EACH ROW on auth.users. Dropped-then-created so the
-- migration is safe to re-run during development (Postgres has no
-- "create trigger if not exists").
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
