import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import type { Profile } from "@/providers/AuthProvider";
import type { SignInInput, SignUpInput } from "@/features/auth/schemas";

/**
 * Authentication mutation hooks (React Query).
 *
 * These wrap Supabase Auth in `useMutation` so the sign-up / sign-in / sign-out
 * flows participate in the same server-state model as the rest of the app: the
 * page reads `isPending` for loading/disabled controls (Req 2.4) and `error`
 * for the visible error message (Req 1.10, 2.2), and reacts to success.
 *
 * The defining concern of this module is the sign-up flow (Requirement 1,
 * criteria 5–10): it MUST NOT proceed to the Directory unless the admin profile
 * row is confirmed to exist. Every failure branch throws so the error lands in
 * `mutation.error` for the page to render — no branch swallows the error or logs
 * it only to the console (Requirement 1.10).
 *
 * _Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 4.3, 4.4_
 */

/** Where an authenticated admin lands (the Directory). */
const DIRECTORY_ROUTE = "/";
/** Where an authenticated member (non-admin) lands. */
const MEMBER_ROUTE = "/member";
/** Where sign-out (and unauthenticated access) sends the user. */
const SIGN_IN_ROUTE = "/sign-in";

/** Columns selected to confirm the profile row; mirrors {@link Profile}. */
const PROFILE_COLUMNS = "id, email, full_name, is_admin, created_at";

/**
 * After a successful sign-up or sign-in, check whether the authenticated user
 * has a pending invitation. If they do, return the accept-invite URL so they
 * are taken directly to the acceptance page. Otherwise, check `profiles.is_admin`:
 * - `true`  → return the Directory route (admin)
 * - `false` → return the Member route (invited member)
 */
async function resolvePostAuthRoute(userEmail: string): Promise<string> {
  // Small delay to ensure the session is fully persisted in the Supabase
  // client before making authenticated requests.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { data: invite } = await supabase
    .from("organization_members")
    .select("id")
    .eq("email", userEmail)
    .eq("status", "invited")
    .maybeSingle();

  if (invite?.id) {
    return `/accept-invite?id=${invite.id}`;
  }

  // No pending invite — determine the landing page by admin status.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("email", userEmail)
    .maybeSingle();

  if (profile && profile.is_admin === false) {
    return MEMBER_ROUTE;
  }

  return DIRECTORY_ROUTE;
}

/**
 * User-facing message shown when account setup could not be confirmed after a
 * successful Auth_Service account creation. Satisfies Requirement 1.6: it tells
 * the user setup failed and advises them to try again or contact support.
 */
export const SIGN_UP_SETUP_FAILURE_MESSAGE =
  "Your account was created, but setup did not finish. Please try again, or " +
  "contact support if the problem continues.";

/** Message shown when sign-in succeeds without yielding a usable session. */
export const SIGN_IN_NO_SESSION_MESSAGE =
  "Sign-in did not establish a session. Please try again.";

/**
 * Error raised when sign-up cannot be confirmed as fully set up — the profile
 * row is missing or could not be read after a successful Auth account creation
 * (Requirements 1.6, 1.8). Distinct from a raw Auth error so the sign-up page
 * can present it as a setup failure rather than a credentials problem.
 */
export class AuthSetupError extends Error {
  constructor(message: string = SIGN_UP_SETUP_FAILURE_MESSAGE) {
    super(message);
    this.name = "AuthSetupError";
  }
}

/**
 * Sign up a new admin, then verify the admin profile row exists before
 * navigating to the Directory.
 *
 * Flow (mirrors the design's sign-up sequence):
 * 1. `supabase.auth.signUp` creates the auth user and establishes a session
 *    (Req 1.1). The `handle_new_user` trigger creates the `profiles` row inside
 *    the same transaction (Req 1.5). If that trigger throws, user creation is
 *    aborted and Auth returns an error here — making the failure detectable
 *    (Req 1.9); we surface it (Req 1.10).
 * 2. After a successful sign-up we re-read the `profiles` row for the new user
 *    (Req 1.7). A read error or a missing row is treated as a setup failure: we
 *    throw {@link AuthSetupError} so the page shows a visible message and we do
 *    NOT navigate (Req 1.6, 1.8).
 *
 * Navigation happens only in `onSuccess`, which runs strictly after the
 * verification in `mutationFn` resolves — guaranteeing we never reach the
 * Directory on an unverified profile.
 *
 * Returns the confirmed {@link Profile} on success.
 */
export function useSignUp(): UseMutationResult<Profile, Error, SignUpInput> {
  const navigate = useNavigate();

  return useMutation<Profile, Error, SignUpInput>({
    mutationFn: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signUp({ email, password });

      // Any Auth error (invalid input, already-registered email, or a trigger
      // failure surfaced as "Database error saving new user") is surfaced, not
      // swallowed (Req 1.3, 1.9, 1.10).
      if (error) {
        throw error;
      }

      // A successful call with no user is anomalous: do not proceed on an
      // unverified state (Req 1.8).
      const user = data.user;
      if (!user) {
        throw new AuthSetupError();
      }

      // Verify the admin profile row actually exists before treating sign-up as
      // complete (Req 1.7). The select runs as the just-authenticated user, so
      // the `profiles` RLS policy (id = auth.uid()) permits reading own row.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      // A read error OR a missing row means setup cannot be confirmed: treat as
      // a setup failure and surface it (Req 1.6, 1.8, 1.10). The error is thrown
      // (not logged-only) so it reaches mutation.error for the page to render.
      if (profileError || !profile) {
        throw new AuthSetupError();
      }

      return profile as Profile;
    },
    onSuccess: (profile) => {
      // Reached only after the profile was confirmed above (Req 1.7).
      // Check for a pending invite and redirect there; otherwise go to directory.
      void resolvePostAuthRoute(profile.email).then((route) => {
        navigate(route, { replace: true });
      });
    },
  });
}

/**
 * Sign in an existing admin and navigate to the Directory on success
 * (Requirements 2.1, 2.2). The page binds `isPending` to a loading indicator
 * and a disabled submit control (Req 2.4) and renders `error` as the auth error
 * message (Req 2.2).
 */
export function useSignIn(): UseMutationResult<Session, Error, SignInInput> {
  const navigate = useNavigate();

  return useMutation<Session, Error, SignInInput>({
    mutationFn: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Surface bad-credential / other auth errors (Req 2.2).
      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error(SIGN_IN_NO_SESSION_MESSAGE);
      }

      return data.session;
    },
    onSuccess: (session) => {
      // Check for a pending invite and redirect there; otherwise go to directory.
      const email = session.user.email ?? "";
      void resolvePostAuthRoute(email).then((route) => {
        navigate(route, { replace: true });
      });
    },
  });
}

/**
 * Sign out the current admin: terminate the Auth session, clear cached server
 * state, and navigate to the sign-in route (Requirements 4.3, 4.4).
 *
 * The cache is cleared here so it is guaranteed empty before navigating,
 * regardless of when the AuthProvider's `onAuthStateChange` SIGNED_OUT listener
 * runs (which also calls `queryClient.clear()`). The two paths are idempotent.
 */
export function useSignOut(): UseMutationResult<void, Error, void> {
  const navigate = useNavigate();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      // Req 4.4: drop all cached server state tied to the previous session.
      queryClient.clear();
      // Req 4.3: return to the sign-in route.
      navigate(SIGN_IN_ROUTE, { replace: true });
    },
  });
}
