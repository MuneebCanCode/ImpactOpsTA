// Feature: admin-org-dashboard, Property 2: Sign-up never proceeds on an unverified profile

/**
 * Property 2: Sign-up never proceeds on an unverified profile
 *
 * For any sign-up outcome in which the admin profile record cannot be confirmed
 * to exist (trigger throws, profile read returns empty, or profile read errors),
 * the Frontend SHALL render a visible setup-failure message and SHALL NOT
 * navigate to the Directory; and for any outcome where the profile is confirmed,
 * the Frontend SHALL navigate to the Directory. No error branch SHALL be
 * swallowed (console-only).
 *
 * Validates: Requirements 1.6, 1.7, 1.8, 1.10
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that transitively load them
// ---------------------------------------------------------------------------

// Mock the supabase module so we can control signUp and profiles.select responses.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Mock react-router-dom so useNavigate returns a spy we can inspect.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { useSignUp, AuthSetupError } from "@/features/auth/hooks";

// ---------------------------------------------------------------------------
// Outcome types
// ---------------------------------------------------------------------------

/**
 * The four outcome shapes the property generates:
 *
 * "auth_error"   — supabase.auth.signUp returns an error (trigger throws or
 *                  bad credentials). The hook must re-throw the raw Auth error.
 * "no_user"      — signUp succeeds but data.user is null/undefined. The hook
 *                  must throw AuthSetupError.
 * "profile_error"— signUp succeeds, user present, but the profiles read returns
 *                  an error. The hook must throw AuthSetupError.
 * "profile_null" — signUp succeeds, user present, profiles read returns null
 *                  (row missing). The hook must throw AuthSetupError.
 * "confirmed"    — signUp succeeds, user present, profile row returned. The
 *                  hook must return the profile and navigate to "/".
 */
type Outcome =
  | "auth_error"
  | "no_user"
  | "profile_error"
  | "profile_null"
  | "confirmed";

// ---------------------------------------------------------------------------
// Arbitrary for outcome shapes
// ---------------------------------------------------------------------------

const outcomeArb = fc.constantFrom<Outcome>(
  "auth_error",
  "no_user",
  "profile_error",
  "profile_null",
  "confirmed",
);

// ---------------------------------------------------------------------------
// Helpers to configure mocks for each outcome
// ---------------------------------------------------------------------------

/** A minimal valid profile object that mirrors the Profile type. */
function makeProfile(userId: string) {
  return {
    id: userId,
    email: "admin@example.com",
    full_name: "Test Admin",
    is_admin: true,
    created_at: new Date().toISOString(),
  };
}

/** A minimal AuthError-like object (supabase-js AuthError shape). */
function makeAuthError(message: string) {
  const err = new Error(message) as Error & {
    status: number;
    code: string;
    __isAuthError: boolean;
  };
  err.name = "AuthApiError";
  err.__isAuthError = true;
  err.status = 400;
  err.code = "unexpected_failure";
  return err;
}

/**
 * Configure the supabase mock to produce the given outcome.
 * Returns the error/profile that the hook should surface.
 */
function configureMocks(outcome: Outcome): {
  expectedError: Error | null;
  expectedProfile: ReturnType<typeof makeProfile> | null;
} {
  const signUpMock = vi.mocked(supabase.auth.signUp);
  const fromMock = vi.mocked(supabase.from);

  const userId = "user-abc-123";

  switch (outcome) {
    case "auth_error": {
      const authErr = makeAuthError("Database error saving new user");
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: authErr,
      } as never);
      // profiles.from should not be called in this branch
      fromMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as never);
      return { expectedError: authErr, expectedProfile: null };
    }

    case "no_user": {
      signUpMock.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as never);
      fromMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as never);
      return { expectedError: new AuthSetupError(), expectedProfile: null };
    }

    case "profile_error": {
      signUpMock.mockResolvedValue({
        data: { user: { id: userId }, session: {} },
        error: null,
      } as never);
      const profileErr = new Error("Profile read failed");
      fromMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: profileErr }),
      } as never);
      return { expectedError: new AuthSetupError(), expectedProfile: null };
    }

    case "profile_null": {
      signUpMock.mockResolvedValue({
        data: { user: { id: userId }, session: {} },
        error: null,
      } as never);
      fromMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as never);
      return { expectedError: new AuthSetupError(), expectedProfile: null };
    }

    case "confirmed": {
      const profile = makeProfile(userId);
      signUpMock.mockResolvedValue({
        data: { user: { id: userId }, session: {} },
        error: null,
      } as never);
      fromMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
      } as never);
      return { expectedError: null, expectedProfile: profile };
    }
  }
}

// ---------------------------------------------------------------------------
// Wrapper providing React Query context
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// ---------------------------------------------------------------------------
// Property 2 tests
// ---------------------------------------------------------------------------

describe("useSignUp – Property 2: Sign-up never proceeds on an unverified profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  /**
   * Property 2a: Navigation occurs iff outcome is "confirmed"
   *
   * For any generated outcome, navigate("/") is called if and only if the
   * profile was confirmed. All other branches must NOT call navigate.
   */
  it(
    "2a: navigation occurs iff outcome is confirmed",
    async () => {
      await fc.assert(
        fc.asyncProperty(outcomeArb, async (outcome) => {
          vi.clearAllMocks();
          mockNavigate.mockClear();

          configureMocks(outcome);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useSignUp(), { wrapper });

          // Trigger the mutation
          result.current.mutate({ email: "test@example.com", password: "password123" });

          // Wait for the mutation to settle
          await waitFor(() => {
            expect(
              result.current.isSuccess || result.current.isError,
            ).toBe(true);
          });

          if (outcome === "confirmed") {
            // Navigation MUST have been called with the directory route
            expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
          } else {
            // Navigation MUST NOT have been called for any unverified outcome
            expect(mockNavigate).not.toHaveBeenCalled();
          }
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 2b: Every non-confirmed outcome throws (never swallows)
   *
   * For any outcome that is not "confirmed", the mutation must land in the
   * error state — meaning the error was thrown and surfaced, not swallowed.
   * Req 1.10: no branch logs-only to console.
   */
  it(
    "2b: every non-confirmed outcome throws and surfaces an error (never swallows)",
    async () => {
      const nonConfirmedOutcomes = fc.constantFrom<Outcome>(
        "auth_error",
        "no_user",
        "profile_error",
        "profile_null",
      );

      await fc.assert(
        fc.asyncProperty(nonConfirmedOutcomes, async (outcome) => {
          vi.clearAllMocks();
          mockNavigate.mockClear();

          configureMocks(outcome);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useSignUp(), { wrapper });

          result.current.mutate({ email: "test@example.com", password: "password123" });

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // The error must be present and be an Error instance (not swallowed)
          expect(result.current.error).not.toBeNull();
          expect(result.current.error).toBeInstanceOf(Error);
          // The mutation must NOT be in success state
          expect(result.current.isSuccess).toBe(false);
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 2c: Auth errors are re-thrown as-is (not wrapped in AuthSetupError)
   *
   * When supabase.auth.signUp returns an error (trigger failure, duplicate
   * email, etc.), the hook must surface that exact error — not wrap it.
   * Req 1.9, 1.10.
   */
  it(
    "2c: auth errors from signUp are surfaced directly (not wrapped)",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant("auth_error" as Outcome), async (outcome) => {
          vi.clearAllMocks();
          mockNavigate.mockClear();

          const { expectedError } = configureMocks(outcome);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useSignUp(), { wrapper });

          result.current.mutate({ email: "test@example.com", password: "password123" });

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // The surfaced error must be the original auth error, not AuthSetupError
          expect(result.current.error).not.toBeInstanceOf(AuthSetupError);
          expect(result.current.error?.message).toBe(expectedError?.message);
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 2d: Profile-unconfirmed outcomes throw AuthSetupError
   *
   * When signUp succeeds but the profile cannot be confirmed (no_user,
   * profile_error, profile_null), the hook must throw AuthSetupError so the
   * page can present it as a setup failure (Req 1.6, 1.8).
   */
  it(
    "2d: profile-unconfirmed outcomes throw AuthSetupError with a non-empty message",
    async () => {
      const profileUnconfirmedOutcomes = fc.constantFrom<Outcome>(
        "no_user",
        "profile_error",
        "profile_null",
      );

      await fc.assert(
        fc.asyncProperty(profileUnconfirmedOutcomes, async (outcome) => {
          vi.clearAllMocks();
          mockNavigate.mockClear();

          configureMocks(outcome);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useSignUp(), { wrapper });

          result.current.mutate({ email: "test@example.com", password: "password123" });

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // Must be an AuthSetupError (Req 1.6)
          expect(result.current.error).toBeInstanceOf(AuthSetupError);
          // Must have a non-empty message so the page can render it (Req 1.10)
          expect(result.current.error?.message.length).toBeGreaterThan(0);
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 2e: Confirmed outcome returns the profile and succeeds
   *
   * When signUp succeeds and the profile row is confirmed, the mutation must
   * resolve to the profile object (Req 1.7) and navigate to "/" (Req 1.1).
   */
  it(
    "2e: confirmed outcome resolves to the profile and navigates to the directory",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant("confirmed" as Outcome), async (outcome) => {
          vi.clearAllMocks();
          mockNavigate.mockClear();

          const { expectedProfile } = configureMocks(outcome);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useSignUp(), { wrapper });

          result.current.mutate({ email: "test@example.com", password: "password123" });

          await waitFor(() => {
            expect(result.current.isSuccess).toBe(true);
          });

          // Must return the confirmed profile
          expect(result.current.data).toEqual(expectedProfile);
          // Must navigate to the directory
          expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
          // Must NOT be in error state
          expect(result.current.isError).toBe(false);
        }),
        { numRuns: 10 },
      );
    },
  );
});

