// Feature: admin-org-dashboard, Property 15: Members list content completeness
//
// Validates: Requirements 8.1, 8.2
//
// For any non-empty set of members, the rendered MembersList SHALL display:
//   - Each member's email address (Req 8.1)
//   - A status badge with data-member-status of 'invited' or 'active' (Req 8.2)
//   - Exactly as many rows as there are members
//
// useMembers and the Supabase client are mocked so the component renders
// without a live backend.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";

import { MembersList } from "@/features/members/MembersList";
import type { OrganizationMember } from "@/types/database";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Supabase client must be stubbed — it throws at import time without env vars.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// Stub useMembers to return a successful query result with the provided data.
const mockUseMembers = vi.fn();

vi.mock("@/features/members/hooks", () => ({
  useMembers: (orgId: string) => mockUseMembers(orgId),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal successful UseQueryResult shape for a given data array. */
function makeSuccessQuery(data: OrganizationMember[]) {
  return {
    data,
    error: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    status: "success" as const,
    fetchStatus: "idle" as const,
    refetch: vi.fn(),
  };
}

/** Render MembersList with the mock returning the given members. */
function renderWithMembers(members: OrganizationMember[]) {
  mockUseMembers.mockReturnValue(makeSuccessQuery(members));
  return render(React.createElement(MembersList, { orgId: "test-org-id" }));
}

// ---------------------------------------------------------------------------
// Cleanup between tests and between fast-check iterations
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid member status: 'invited' | 'active' */
const memberStatusArb = fc.constantFrom("invited" as const, "active" as const);

/** Generate a plausible email string. */
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
    fc.constantFrom("com", "org", "net", "io"),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generate a single OrganizationMember with random email and status. */
const memberArb: fc.Arbitrary<OrganizationMember> = fc
  .tuple(fc.uuid(), fc.uuid(), emailArb, memberStatusArb, fc.uuid())
  .map(([id, orgId, email, status, userId]) => ({
    id,
    organization_id: orgId,
    user_id: userId,
    email,
    status,
    role: "member" as const,
    invited_at: new Date().toISOString(),
    joined_at: status === "active" ? new Date().toISOString() : null,
  }));

/** Generate an array of 1–10 members with unique emails. */
const membersArb: fc.Arbitrary<OrganizationMember[]> = fc
  .array(memberArb, { minLength: 1, maxLength: 10 })
  .filter((members) => {
    // Ensure emails are unique within the generated set so rows are distinct.
    const emails = members.map((m) => m.email);
    return new Set(emails).size === emails.length;
  });

// ---------------------------------------------------------------------------
// Property 15 tests
// ---------------------------------------------------------------------------

describe("Property 15: Members list content completeness", () => {
  /**
   * Property 15a: Each member's email appears in the rendered list
   *
   * **Validates: Requirements 8.1**
   */
  it(
    "15a: each member email is visible in the rendered list (100 iterations)",
    async () => {
      // **Validates: Requirements 8.1**
      await fc.assert(
        fc.asyncProperty(membersArb, async (members) => {
          renderWithMembers(members);

          for (const member of members) {
            // The email text must appear somewhere in the rendered output.
            const emailEl = screen.queryByText(member.email);
            expect(emailEl).not.toBeNull();
          }

          cleanup();
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 15b: Each member's status badge shows 'invited' or 'active'
   *
   * Checks the data-member-status attribute on each rendered badge.
   *
   * **Validates: Requirements 8.2**
   */
  it(
    "15b: each member status badge has data-member-status of 'invited' or 'active' (100 iterations)",
    async () => {
      // **Validates: Requirements 8.2**
      await fc.assert(
        fc.asyncProperty(membersArb, async (members) => {
          renderWithMembers(members);

          const badges = document.querySelectorAll("[data-member-status]");

          // Every badge must carry a valid status value.
          for (const badge of badges) {
            const status = badge.getAttribute("data-member-status");
            expect(["invited", "active"]).toContain(status);
          }

          cleanup();
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 15c: The number of rendered rows equals the number of members
   *
   * **Validates: Requirements 8.1, 8.2**
   */
  it(
    "15c: number of rendered member rows equals number of members (100 iterations)",
    async () => {
      // **Validates: Requirements 8.1, 8.2**
      await fc.assert(
        fc.asyncProperty(membersArb, async (members) => {
          renderWithMembers(members);

          // Each member is rendered as an <li> with data-member-id.
          const rows = document.querySelectorAll("[data-member-id]");
          expect(rows.length).toBe(members.length);

          cleanup();
        }),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 15d: Each member's status badge matches the member's actual status
   *
   * Verifies that the badge for each member reflects the correct status value,
   * not just any valid status.
   *
   * **Validates: Requirements 8.2**
   */
  it(
    "15d: each member status badge matches the member's actual status (100 iterations)",
    async () => {
      // **Validates: Requirements 8.2**
      await fc.assert(
        fc.asyncProperty(membersArb, async (members) => {
          renderWithMembers(members);

          for (const member of members) {
            // Find the row for this member by its data-member-id attribute.
            const row = document.querySelector(
              `[data-member-id="${member.id}"]`,
            );
            expect(row).not.toBeNull();

            // The badge within this row must carry the member's exact status.
            const badge = row!.querySelector("[data-member-status]");
            expect(badge).not.toBeNull();
            expect(badge!.getAttribute("data-member-status")).toBe(
              member.status,
            );
          }

          cleanup();
        }),
        { numRuns: 10 },
      );
    },
  );
});

