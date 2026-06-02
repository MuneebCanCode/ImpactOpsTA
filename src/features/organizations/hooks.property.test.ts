// Feature: admin-org-dashboard, Property 12: Member count accuracy

/**
 * Property 12: Member count accuracy
 *
 * For any organization row returned by the database, the `memberCount` field
 * produced by `toOrganizationWithMemberCount` MUST equal the `count` value
 * embedded in the `organization_members` aggregate array. When the aggregate
 * array is empty or absent, `memberCount` MUST be 0. `memberCount` is always
 * a non-negative integer.
 *
 * Validates: Requirements 9.3
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mock supabase before importing hooks.ts — the module throws at load time
// when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent.
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import {
  toOrganizationWithMemberCount,
  type OrganizationRowWithMemberCount,
} from "@/features/organizations/hooks";

// ---------------------------------------------------------------------------
// Minimal base-org factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal OrganizationRowWithMemberCount with the given
 * `organization_members` payload. All other fields are fixed stubs so the
 * test focuses purely on the member-count transformation.
 */
function makeRow(
  organization_members: { count: number }[],
): OrganizationRowWithMemberCount {
  return {
    id: "org-test-id",
    name: "Test Org",
    type: "nonprofit",
    owner_id: "owner-test-id",
    school_district: null,
    created_at: "2024-01-01T00:00:00Z",
    organization_members,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A non-negative integer count in [0, 1000] — mirrors the task spec. */
const countArb = fc.integer({ min: 0, max: 1000 });

/** A row whose aggregate contains exactly one element with a generated count. */
const singleCountRowArb = countArb.map((count) => ({
  row: makeRow([{ count }]),
  expectedCount: count,
}));

/** A row with zero members (empty aggregate array). */
const emptyMembersRowArb = fc.constant({
  row: makeRow([]),
  expectedCount: 0,
});

/** A row with many members — aggregate array has one element with a large count. */
const manyMembersRowArb = fc.integer({ min: 2, max: 1000 }).map((count) => ({
  row: makeRow([{ count }]),
  expectedCount: count,
}));

// ---------------------------------------------------------------------------
// Property 12 tests
// ---------------------------------------------------------------------------

describe(
  "toOrganizationWithMemberCount – Property 12: Member count accuracy",
  () => {
    /**
     * Property 12a: memberCount equals the count from the embedded aggregate
     *
     * For any non-negative integer count, the transformation must produce a
     * `memberCount` that equals that count exactly.
     */
    it(
      "12a: memberCount equals the count from the embedded aggregate",
      () => {
        fc.assert(
          fc.property(singleCountRowArb, ({ row, expectedCount }) => {
            const result = toOrganizationWithMemberCount(row);
            expect(result.memberCount).toBe(expectedCount);
          }),
          { numRuns: 25 },
        );
      },
    );

    /**
     * Property 12b: memberCount is 0 when organization_members is an empty array
     *
     * An org with no members has an empty aggregate array; the transformation
     * must produce memberCount === 0.
     */
    it(
      "12b: memberCount is 0 when organization_members is an empty array",
      () => {
        fc.assert(
          fc.property(emptyMembersRowArb, ({ row, expectedCount }) => {
            const result = toOrganizationWithMemberCount(row);
            expect(result.memberCount).toBe(expectedCount);
          }),
          { numRuns: 25 },
        );
      },
    );

    /**
     * Property 12c: memberCount is 0 when organization_members is undefined/null
     *
     * Defensive: if the aggregate field is absent (undefined or null), the
     * transformation must fall back to 0 rather than throwing.
     */
    it(
      "12c: memberCount is 0 when organization_members is undefined or null",
      () => {
        const nullishArb = fc.constantFrom(
          undefined as unknown as { count: number }[],
          null as unknown as { count: number }[],
        );

        fc.assert(
          fc.property(nullishArb, (members) => {
            const row = makeRow([]);
            // Override the field with the nullish value
            (row as unknown as Record<string, unknown>).organization_members =
              members;
            const result = toOrganizationWithMemberCount(
              row as OrganizationRowWithMemberCount,
            );
            expect(result.memberCount).toBe(0);
          }),
          { numRuns: 25 },
        );
      },
    );

    /**
     * Property 12d: memberCount is always a non-negative integer
     *
     * For any generated count in [0, 1000], the resulting memberCount must be
     * a finite, non-negative integer.
     */
    it(
      "12d: memberCount is always a non-negative integer",
      () => {
        fc.assert(
          fc.property(
            fc.oneof(singleCountRowArb, emptyMembersRowArb, manyMembersRowArb),
            ({ row }) => {
              const result = toOrganizationWithMemberCount(row);
              expect(result.memberCount).toBeGreaterThanOrEqual(0);
              expect(Number.isInteger(result.memberCount)).toBe(true);
            },
          ),
          { numRuns: 25 },
        );
      },
    );
  },
);

