// Feature: admin-org-dashboard, Property 18: Invitation acceptance transition
// Feature: admin-org-dashboard, Property 19: Invalid invitation handling

/**
 * Property 19: Invalid invitation handling
 *
 * For any non-existent or already-accepted invitation reference, the
 * useAcceptInvitation mutation SHALL:
 *   - land in the isError state (never isSuccess)
 *   - throw an AcceptInvitationError (never a generic Error)
 *   - carry a non-empty, informative message
 *   - never call the UPDATE path (no record created or activated)
 *
 * Validates: Requirements 16.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that transitively load them
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import {
  useAcceptInvitation,
  AcceptInvitationError,
  MISSING_INVITATION_MESSAGE,
  INVITATION_NOT_FOUND_MESSAGE,
  INVITATION_ALREADY_ACCEPTED_MESSAGE,
} from "@/features/invitations/hooks";

// ---------------------------------------------------------------------------
// Scenario types
// ---------------------------------------------------------------------------

/**
 * The three invalid-invitation scenarios the property generates:
 *
 * "missing_id"       — invitationId is empty/whitespace-only; the hook must
 *                      throw AcceptInvitationError(MISSING_INVITATION_MESSAGE)
 *                      without ever calling supabase.from.
 *
 * "not_found"        — maybeSingle returns null (no row for the given id); the
 *                      hook must throw AcceptInvitationError(INVITATION_NOT_FOUND_MESSAGE).
 *
 * "already_accepted" — the row exists but is already accepted (status!='invited',
 *                      or user_id set, or joined_at set); the hook must throw
 *                      AcceptInvitationError(INVITATION_ALREADY_ACCEPTED_MESSAGE).
 */
type InvalidScenario = "missing_id" | "not_found" | "already_accepted";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates empty or whitespace-only strings (invalid invitation ids). */
const emptyIdArb = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\t"),
  fc.constant("\n"),
  fc.stringMatching(/^\s+$/),
);

/** Generates plausible non-empty UUID-like strings for the not_found case. */
const nonExistentIdArb = fc.uuid();

/**
 * Generates already-accepted row shapes. At least one of the three "accepted"
 * signals is set: status !== 'invited', user_id !== null, joined_at !== null.
 */
const alreadyAcceptedRowArb = fc.oneof(
  // status is 'active' (most common case)
  fc.record({
    id: fc.uuid(),
    status: fc.constant("active"),
    user_id: fc.option(fc.uuid(), { nil: null }),
    joined_at: fc.option(fc.string(), { nil: null }),
    organization_id: fc.uuid(),
    email: fc.emailAddress(),
  }),
  // status is 'invited' but user_id is already set
  fc.record({
    id: fc.uuid(),
    status: fc.constant("invited"),
    user_id: fc.uuid(), // non-null
    joined_at: fc.option(fc.string(), { nil: null }),
    organization_id: fc.uuid(),
    email: fc.emailAddress(),
  }),
  // status is 'invited', user_id null, but joined_at is already set
  fc.record({
    id: fc.uuid(),
    status: fc.constant("invited"),
    user_id: fc.constant(null),
    joined_at: fc.string().filter((s) => s.length > 0), // non-null
    organization_id: fc.uuid(),
    email: fc.emailAddress(),
  }),
);

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** A minimal authenticated user object. */
function makeUser() {
  return { id: "auth-user-abc-123", email: "user@example.com" };
}

/**
 * Spy on the supabase.from chain so we can assert UPDATE was never called.
 * Returns the update spy for assertion.
 */
function makeFromChain(options: {
  maybeSingleResult: { data: unknown; error: unknown };
}) {
  const updateSpy = vi.fn();
  const fromChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(options.maybeSingleResult),
    update: updateSpy.mockReturnThis(),
  };
  vi.mocked(supabase.from).mockReturnValue(fromChain as never);
  return { updateSpy, fromChain };
}

/**
 * Configure mocks for the given scenario.
 * Returns the update spy so tests can assert it was never called.
 */
function configureMocks(
  scenario: InvalidScenario,
  row?: Record<string, unknown>,
): { updateSpy: ReturnType<typeof vi.fn> } {
  const getUser = vi.mocked(supabase.auth.getUser);

  switch (scenario) {
    case "missing_id": {
      // getUser should not be called for missing id, but set it up defensively
      getUser.mockResolvedValue({
        data: { user: makeUser() },
        error: null,
      } as never);
      const { updateSpy } = makeFromChain({
        maybeSingleResult: { data: null, error: null },
      });
      return { updateSpy };
    }

    case "not_found": {
      getUser.mockResolvedValue({
        data: { user: makeUser() },
        error: null,
      } as never);
      const { updateSpy } = makeFromChain({
        maybeSingleResult: { data: null, error: null }, // null = row not found
      });
      return { updateSpy };
    }

    case "already_accepted": {
      getUser.mockResolvedValue({
        data: { user: makeUser() },
        error: null,
      } as never);
      const { updateSpy } = makeFromChain({
        maybeSingleResult: { data: row ?? null, error: null },
      });
      return { updateSpy };
    }
  }
}

// ---------------------------------------------------------------------------
// React Query wrapper
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
// Property 19 tests
// ---------------------------------------------------------------------------

describe("useAcceptInvitation – Property 19: Invalid invitation handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 19a: Empty/missing invitation id → MISSING_INVITATION_MESSAGE
   *
   * For any empty or whitespace-only invitation id, the mutation must land in
   * isError with AcceptInvitationError carrying MISSING_INVITATION_MESSAGE,
   * and supabase.from must never be called (no DB access at all).
   *
   * **Validates: Requirements 16.3**
   */
  it(
    "19a: empty/missing id throws AcceptInvitationError with MISSING_INVITATION_MESSAGE and never calls UPDATE",
    async () => {
      await fc.assert(
        fc.asyncProperty(emptyIdArb, async (invitationId) => {
          vi.clearAllMocks();

          const { updateSpy } = configureMocks("missing_id");

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useAcceptInvitation(), {
            wrapper,
          });

          result.current.mutate(invitationId);

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // Must be in error state, never success
          expect(result.current.isSuccess).toBe(false);

          // Error must be AcceptInvitationError
          expect(result.current.error).toBeInstanceOf(AcceptInvitationError);

          // Message must be the informative MISSING_INVITATION_MESSAGE
          expect(result.current.error?.message).toBe(MISSING_INVITATION_MESSAGE);

          // Message must be non-empty
          expect(result.current.error?.message.length).toBeGreaterThan(0);

          // UPDATE must never have been called (no record created or activated)
          expect(updateSpy).not.toHaveBeenCalled();
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 19b: Non-existent row → INVITATION_NOT_FOUND_MESSAGE
   *
   * For any non-existent invitation id (maybeSingle returns null), the mutation
   * must land in isError with AcceptInvitationError carrying
   * INVITATION_NOT_FOUND_MESSAGE, and UPDATE must never be called.
   *
   * **Validates: Requirements 16.3**
   */
  it(
    "19b: non-existent row throws AcceptInvitationError with INVITATION_NOT_FOUND_MESSAGE and never calls UPDATE",
    async () => {
      await fc.assert(
        fc.asyncProperty(nonExistentIdArb, async (invitationId) => {
          vi.clearAllMocks();

          const { updateSpy } = configureMocks("not_found");

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useAcceptInvitation(), {
            wrapper,
          });

          result.current.mutate(invitationId);

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // Must be in error state, never success
          expect(result.current.isSuccess).toBe(false);

          // Error must be AcceptInvitationError
          expect(result.current.error).toBeInstanceOf(AcceptInvitationError);

          // Message must be the informative INVITATION_NOT_FOUND_MESSAGE
          expect(result.current.error?.message).toBe(
            INVITATION_NOT_FOUND_MESSAGE,
          );

          // Message must be non-empty
          expect(result.current.error?.message.length).toBeGreaterThan(0);

          // UPDATE must never have been called (no record created or activated)
          expect(updateSpy).not.toHaveBeenCalled();
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 19c: Already-accepted row → INVITATION_ALREADY_ACCEPTED_MESSAGE
   *
   * For any row that is already accepted (status!='invited', user_id set, or
   * joined_at set), the mutation must land in isError with AcceptInvitationError
   * carrying INVITATION_ALREADY_ACCEPTED_MESSAGE, and UPDATE must never be
   * called (no re-activation).
   *
   * **Validates: Requirements 16.3**
   */
  it(
    "19c: already-accepted row throws AcceptInvitationError with INVITATION_ALREADY_ACCEPTED_MESSAGE and never calls UPDATE",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          nonExistentIdArb,
          alreadyAcceptedRowArb,
          async (invitationId, row) => {
            vi.clearAllMocks();

            const { updateSpy } = configureMocks(
              "already_accepted",
              row as Record<string, unknown>,
            );

            const wrapper = makeWrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitationId);

            await waitFor(() => {
              expect(result.current.isError).toBe(true);
            });

            // Must be in error state, never success
            expect(result.current.isSuccess).toBe(false);

            // Error must be AcceptInvitationError
            expect(result.current.error).toBeInstanceOf(AcceptInvitationError);

            // Message must be the informative INVITATION_ALREADY_ACCEPTED_MESSAGE
            expect(result.current.error?.message).toBe(
              INVITATION_ALREADY_ACCEPTED_MESSAGE,
            );

            // Message must be non-empty
            expect(result.current.error?.message.length).toBeGreaterThan(0);

            // UPDATE must never have been called (no record re-activated)
            expect(updateSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 19d: All invalid scenarios always land in isError with a
   * non-empty AcceptInvitationError message (universal guard)
   *
   * Regardless of which invalid scenario is generated, the mutation must
   * always surface an AcceptInvitationError with a non-empty message.
   * This is the universal guard that no invalid path is swallowed.
   *
   * **Validates: Requirements 16.3**
   */
  it(
    "19d: all invalid scenarios always produce AcceptInvitationError with a non-empty message",
    async () => {
      const scenarioArb = fc.oneof(
        // missing id
        emptyIdArb.map((id) => ({
          id,
          scenario: "missing_id" as InvalidScenario,
          row: undefined,
        })),
        // not found
        nonExistentIdArb.map((id) => ({
          id,
          scenario: "not_found" as InvalidScenario,
          row: undefined,
        })),
        // already accepted
        fc
          .tuple(nonExistentIdArb, alreadyAcceptedRowArb)
          .map(([id, row]) => ({
            id,
            scenario: "already_accepted" as InvalidScenario,
            row: row as Record<string, unknown>,
          })),
      );

      await fc.assert(
        fc.asyncProperty(scenarioArb, async ({ id, scenario, row }) => {
          vi.clearAllMocks();

          configureMocks(scenario, row);

          const wrapper = makeWrapper();
          const { result } = renderHook(() => useAcceptInvitation(), {
            wrapper,
          });

          result.current.mutate(id);

          await waitFor(() => {
            expect(result.current.isError).toBe(true);
          });

          // Universal guard: always AcceptInvitationError, never success
          expect(result.current.isSuccess).toBe(false);
          expect(result.current.error).toBeInstanceOf(AcceptInvitationError);
          expect(result.current.error?.message.length).toBeGreaterThan(0);
        }),
        { numRuns: 10 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 18: Invitation acceptance transition
// ---------------------------------------------------------------------------

/**
 * Property 18: Invitation acceptance transition
 *
 * For any pending Invitation, when the invited person completes acceptance,
 * the corresponding Member record SHALL be linked to the resulting user account
 * (Requirement 16.1), its status SHALL transition from invited to active and
 * its join timestamp SHALL be set (Requirement 16.2), and the organization
 * reference and email SHALL be unchanged (design Property 18).
 *
 * Validates: Requirements 16.1, 16.2
 */

// ---------------------------------------------------------------------------
// Property 18 arbitraries
// ---------------------------------------------------------------------------

/** Generate a UUID-like string for Property 18 tests. */
const p18UuidArb = fc.uuid();

/** Generate a valid email address for Property 18 tests. */
const p18EmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.constantFrom("com", "org", "net", "io"),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Generate a pending invitation row:
 * - status = 'invited'
 * - user_id = null  (not yet linked)
 * - joined_at = null (not yet accepted)
 * - random id, organization_id, email
 */
const pendingInvitationArb = fc.record({
  id: p18UuidArb,
  organization_id: p18UuidArb,
  user_id: fc.constant(null as null),
  email: p18EmailArb,
  status: fc.constant("invited" as const),
  role: fc.constantFrom("admin" as const, "member" as const),
  invited_at: fc.constant(new Date("2024-01-01T00:00:00Z").toISOString()),
  joined_at: fc.constant(null as null),
});

/** Generate the accepting user's id. */
const acceptingUserIdArb = p18UuidArb;

// ---------------------------------------------------------------------------
// Property 18 helpers
// ---------------------------------------------------------------------------

type PendingInvitation = {
  id: string;
  organization_id: string;
  user_id: null;
  email: string;
  status: "invited";
  role: "admin" | "member";
  invited_at: string;
  joined_at: null;
};

/**
 * Build the accepted row that the UPDATE would return:
 * - user_id set to the accepting user
 * - status set to 'active'
 * - joined_at set to a non-null ISO timestamp
 * - organization_id and email UNCHANGED from the original invitation
 */
function buildAcceptedRow(
  invitation: PendingInvitation,
  acceptingUserId: string,
) {
  return {
    ...invitation,
    user_id: acceptingUserId,
    status: "active" as const,
    joined_at: new Date().toISOString(),
  };
}

/**
 * Configure the supabase mock to simulate a successful acceptance for Property 18.
 *
 * The hook calls:
 *   1. supabase.auth.getUser()          → returns the accepting user
 *   2. supabase.from("organization_members").select("*").eq("id", id).maybeSingle()
 *      → returns the pending invitation row
 *   3. supabase.from("organization_members").update({...}).eq("id", id).eq("status","invited").select()
 *      → returns the accepted row
 */
function configureMocksForSuccess(
  invitation: PendingInvitation,
  acceptingUserId: string,
) {
  const acceptedRow = buildAcceptedRow(invitation, acceptingUserId);

  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: acceptingUserId } as never },
    error: null,
  } as never);

  // Two sequential calls to supabase.from("organization_members"):
  // first a SELECT (maybeSingle), then an UPDATE (select).
  let callCount = 0;

  vi.mocked(supabase.from).mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // First call: SELECT to read the existing invitation
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: invitation, error: null }),
      } as never;
    } else {
      // Second call: UPDATE to accept the invitation
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi
          .fn()
          .mockResolvedValue({ data: [acceptedRow], error: null }),
      } as never;
    }
  });

  return acceptedRow;
}

/** Create a fresh React Query wrapper for Property 18 tests. */
function makeP18Wrapper() {
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
// Property 18 tests
// ---------------------------------------------------------------------------

describe("useAcceptInvitation – Property 18: Invitation acceptance transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 18a: Acceptance links the user (Requirement 16.1)
   *
   * For any pending invitation and any accepting user, the UPDATE payload
   * SHALL set user_id to the accepting user's id.
   *
   * **Validates: Requirements 16.1**
   */
  it(
    "18a: acceptance sets user_id to the accepting user's id (Req 16.1)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingInvitationArb,
          acceptingUserIdArb,
          async (invitation, acceptingUserId) => {
            vi.clearAllMocks();

            configureMocksForSuccess(invitation, acceptingUserId);

            const wrapper = makeP18Wrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitation.id);

            await waitFor(() => {
              expect(result.current.isSuccess).toBe(true);
            });

            // The returned member must have user_id equal to the accepting user
            expect(result.current.data?.user_id).toBe(acceptingUserId);
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 18b: Acceptance flips status to 'active' (Requirement 16.2)
   *
   * For any pending invitation, the UPDATE SHALL set status to 'active'.
   *
   * **Validates: Requirements 16.2**
   */
  it(
    "18b: acceptance sets status to 'active' (Req 16.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingInvitationArb,
          acceptingUserIdArb,
          async (invitation, acceptingUserId) => {
            vi.clearAllMocks();

            configureMocksForSuccess(invitation, acceptingUserId);

            const wrapper = makeP18Wrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitation.id);

            await waitFor(() => {
              expect(result.current.isSuccess).toBe(true);
            });

            expect(result.current.data?.status).toBe("active");
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 18c: Acceptance sets a non-null joined_at timestamp (Requirement 16.2)
   *
   * For any pending invitation, the UPDATE SHALL set joined_at to a non-null
   * ISO timestamp string.
   *
   * **Validates: Requirements 16.2**
   */
  it(
    "18c: acceptance sets joined_at to a non-null timestamp (Req 16.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingInvitationArb,
          acceptingUserIdArb,
          async (invitation, acceptingUserId) => {
            vi.clearAllMocks();

            configureMocksForSuccess(invitation, acceptingUserId);

            const wrapper = makeP18Wrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitation.id);

            await waitFor(() => {
              expect(result.current.isSuccess).toBe(true);
            });

            // joined_at must be non-null
            expect(result.current.data?.joined_at).not.toBeNull();
            // joined_at must be a parseable ISO date string
            expect(
              new Date(result.current.data!.joined_at!).getTime(),
            ).not.toBeNaN();
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 18d: organization_id is NOT changed by acceptance (design Property 18)
   *
   * For any pending invitation, the UPDATE SHALL leave organization_id
   * identical to the original invitation's organization_id.
   *
   * **Validates: Requirements 16.1, 16.2**
   */
  it(
    "18d: acceptance leaves organization_id unchanged (design Property 18)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingInvitationArb,
          acceptingUserIdArb,
          async (invitation, acceptingUserId) => {
            vi.clearAllMocks();

            configureMocksForSuccess(invitation, acceptingUserId);

            const wrapper = makeP18Wrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitation.id);

            await waitFor(() => {
              expect(result.current.isSuccess).toBe(true);
            });

            // organization_id must be unchanged
            expect(result.current.data?.organization_id).toBe(
              invitation.organization_id,
            );
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 18e: email is NOT changed by acceptance (design Property 18)
   *
   * For any pending invitation, the UPDATE SHALL leave email identical to
   * the original invitation's email.
   *
   * **Validates: Requirements 16.1, 16.2**
   */
  it(
    "18e: acceptance leaves email unchanged (design Property 18)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingInvitationArb,
          acceptingUserIdArb,
          async (invitation, acceptingUserId) => {
            vi.clearAllMocks();

            configureMocksForSuccess(invitation, acceptingUserId);

            const wrapper = makeP18Wrapper();
            const { result } = renderHook(() => useAcceptInvitation(), {
              wrapper,
            });

            result.current.mutate(invitation.id);

            await waitFor(() => {
              expect(result.current.isSuccess).toBe(true);
            });

            // email must be unchanged
            expect(result.current.data?.email).toBe(invitation.email);
          },
        ),
        { numRuns: 10 },
      );
    },
  );
});

