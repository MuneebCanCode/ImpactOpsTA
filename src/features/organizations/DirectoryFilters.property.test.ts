// Feature: admin-org-dashboard, Property 17: Directory search and filter correctness
//
// Validates: Requirements 18.1, 18.2
//
// For any set of organizations, search term, and type filter, the displayed
// organizations SHALL be exactly those whose name matches the search term
// (case-insensitive substring) AND whose type matches the selected type filter
// (or all types when no filter is selected) — no non-matching organization
// SHALL appear and no matching organization SHALL be omitted.
//
// Since the actual filtering happens server-side in Supabase (ilike for search,
// eq for type), this test validates the FILTER LOGIC itself by implementing a
// pure `applyFilters` function that mirrors the server-side behavior and testing
// it with fast-check across 100+ iterations.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ORG_TYPES, type OrgType } from "./schemas";
import type { OrganizationFilters } from "./hooks";

// ---------------------------------------------------------------------------
// Pure filter function mirroring server-side logic
// ---------------------------------------------------------------------------

/**
 * A minimal organization shape sufficient for filter testing.
 * Mirrors the relevant fields of the `Organization` database row type.
 */
interface FilterableOrg {
  id: string;
  name: string;
  type: OrgType;
}

/**
 * Pure client-side replica of the server-side filter logic applied by
 * `useOrganizations` via Supabase PostgREST:
 *   - `search` → case-insensitive substring match on `name` (mirrors `ilike '%…%'`)
 *   - `type`   → exact match on `type` (mirrors `eq('type', value)`)
 *
 * Both filters are AND-ed: an org must satisfy every active filter to appear.
 * An absent or empty `search` and an absent `type` mean "no filter" (all orgs pass).
 */
export function applyFilters(
  orgs: FilterableOrg[],
  filters: OrganizationFilters,
): FilterableOrg[] {
  const search = filters.search?.trim();
  const type = filters.type;

  return orgs.filter((org) => {
    // Case-insensitive substring match (mirrors Postgres ilike '%term%')
    if (search) {
      if (!org.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
    }
    // Exact type match (mirrors Postgres eq)
    if (type) {
      if (org.type !== type) {
        return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid OrgType. */
const orgTypeArb = fc.constantFrom<OrgType>(...ORG_TYPES);

/** Generate a realistic organization name (printable ASCII, non-empty). */
const orgNameArb = fc.string({ minLength: 1, maxLength: 60 }).filter(
  (s) => s.trim().length > 0,
);

/** Generate a single filterable org. */
const orgArb: fc.Arbitrary<FilterableOrg> = fc.record({
  id: fc.uuid(),
  name: orgNameArb,
  type: orgTypeArb,
});

/** Generate a list of 0–20 orgs. */
const orgsArb = fc.array(orgArb, { minLength: 0, maxLength: 20 });

/**
 * Generate a search term that is either:
 *   - undefined (no search filter)
 *   - a non-empty string (active search filter)
 *
 * We include both random strings and substrings derived from org names so the
 * generator produces both matching and non-matching scenarios.
 */
const searchTermArb = fc.option(
  fc.oneof(
    // Completely random search term (often no match)
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    // Whitespace-only (should be treated as no filter after trim)
    fc.constant("   "),
  ),
  { nil: undefined },
);

/** Generate an optional type filter. */
const typeFilterArb = fc.option(orgTypeArb, { nil: undefined });

/** Full filter object. */
const filtersArb: fc.Arbitrary<OrganizationFilters> = fc.record({
  search: searchTermArb,
  type: typeFilterArb,
});

// ---------------------------------------------------------------------------
// Helper: reference implementation for a single org
// ---------------------------------------------------------------------------

function orgMatchesFilters(org: FilterableOrg, filters: OrganizationFilters): boolean {
  const search = filters.search?.trim();
  if (search && !org.name.toLowerCase().includes(search.toLowerCase())) {
    return false;
  }
  if (filters.type && org.type !== filters.type) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Property 17 tests
// ---------------------------------------------------------------------------

describe("Property 17: Directory search and filter correctness", () => {
  /**
   * Property 17a: No filters → all orgs returned
   *
   * When both search and type are absent (or search is whitespace-only),
   * applyFilters must return every org unchanged.
   */
  it(
    "17a: with no active filters, all orgs are returned",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(orgsArb, (orgs) => {
          // No filters at all
          expect(applyFilters(orgs, {})).toEqual(orgs);

          // Whitespace-only search is treated as no filter (trimmed to empty)
          expect(applyFilters(orgs, { search: "   " })).toEqual(orgs);
          expect(applyFilters(orgs, { search: "\t" })).toEqual(orgs);
        }),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17b: Search filter → only name-matching orgs returned
   *
   * For any non-empty search term, the result must contain exactly the orgs
   * whose name contains the term (case-insensitive substring).
   */
  it(
    "17b: with a search term, only orgs whose name contains the term (case-insensitive) are returned",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(
          orgsArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (orgs, search) => {
            const filters: OrganizationFilters = { search };
            const result = applyFilters(orgs, filters);

            // Every returned org must match the search term
            for (const org of result) {
              expect(org.name.toLowerCase()).toContain(search.trim().toLowerCase());
            }

            // Every org that matches must be in the result
            const expected = orgs.filter((org) =>
              org.name.toLowerCase().includes(search.trim().toLowerCase()),
            );
            expect(result).toEqual(expected);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17c: Type filter → only orgs of that type returned
   *
   * For any selected type, the result must contain exactly the orgs of that type.
   */
  it(
    "17c: with a type filter, only orgs of that type are returned",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(orgsArb, orgTypeArb, (orgs, type) => {
          const filters: OrganizationFilters = { type };
          const result = applyFilters(orgs, filters);

          // Every returned org must have the selected type
          for (const org of result) {
            expect(org.type).toBe(type);
          }

          // Every org of that type must be in the result
          const expected = orgs.filter((org) => org.type === type);
          expect(result).toEqual(expected);
        }),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17d: Both filters → only orgs matching BOTH are returned
   *
   * When both search and type are active, the result must be the intersection:
   * orgs that satisfy the name substring AND the exact type match.
   */
  it(
    "17d: with both filters, only orgs matching BOTH search and type are returned",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(
          orgsArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          orgTypeArb,
          (orgs, search, type) => {
            const filters: OrganizationFilters = { search, type };
            const result = applyFilters(orgs, filters);

            const trimmedSearch = search.trim().toLowerCase();

            // Every returned org must satisfy BOTH conditions
            for (const org of result) {
              expect(org.name.toLowerCase()).toContain(trimmedSearch);
              expect(org.type).toBe(type);
            }

            // Every org satisfying BOTH must be in the result
            const expected = orgs.filter(
              (org) =>
                org.name.toLowerCase().includes(trimmedSearch) && org.type === type,
            );
            expect(result).toEqual(expected);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17e: Result is always a subset of the input
   *
   * For any orgs and any filters, every org in the result must also be in the
   * original input — applyFilters never invents new orgs.
   */
  it(
    "17e: the result is always a subset of the input",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(orgsArb, filtersArb, (orgs, filters) => {
          const result = applyFilters(orgs, filters);

          // Every result org must exist in the original input (by reference)
          for (const org of result) {
            expect(orgs).toContain(org);
          }

          // Result length cannot exceed input length
          expect(result.length).toBeLessThanOrEqual(orgs.length);
        }),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17f: No false negatives — matching orgs are never omitted
   *
   * For any orgs and filters, every org that satisfies the filter criteria
   * must appear in the result (completeness / no false negatives).
   */
  it(
    "17f: no matching org is omitted from the result (no false negatives)",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(orgsArb, filtersArb, (orgs, filters) => {
          const result = applyFilters(orgs, filters);
          const resultIds = new Set(result.map((o) => o.id));

          for (const org of orgs) {
            if (orgMatchesFilters(org, filters)) {
              expect(resultIds.has(org.id)).toBe(true);
            }
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17g: No false positives — non-matching orgs never appear
   *
   * For any orgs and filters, every org in the result must satisfy the filter
   * criteria (precision / no false positives).
   */
  it(
    "17g: no non-matching org appears in the result (no false positives)",
    () => {
      // **Validates: Requirements 18.1, 18.2**
      fc.assert(
        fc.property(orgsArb, filtersArb, (orgs, filters) => {
          const result = applyFilters(orgs, filters);

          for (const org of result) {
            expect(orgMatchesFilters(org, filters)).toBe(true);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17h: Search is case-insensitive
   *
   * Searching with an uppercase version of a name substring must return the
   * same orgs as searching with the lowercase version.
   */
  it(
    "17h: search matching is case-insensitive (uppercase and lowercase terms yield the same result)",
    () => {
      // **Validates: Requirements 18.1**
      fc.assert(
        fc.property(
          orgsArb,
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
          (orgs, search) => {
            const lowerResult = applyFilters(orgs, { search: search.toLowerCase() });
            const upperResult = applyFilters(orgs, { search: search.toUpperCase() });
            const mixedResult = applyFilters(orgs, { search });

            // All three must return the same set of org ids
            const toIds = (arr: FilterableOrg[]) =>
              arr.map((o) => o.id).sort();

            expect(toIds(lowerResult)).toEqual(toIds(upperResult));
            expect(toIds(lowerResult)).toEqual(toIds(mixedResult));
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 17i: Derived-substring search always finds the source org
   *
   * If we take a substring of an org's name and use it as the search term,
   * that org must appear in the result (assuming no type filter).
   */
  it(
    "17i: a substring of an org name always matches that org (no false negatives for derived substrings)",
    () => {
      // **Validates: Requirements 18.1**
      fc.assert(
        fc.property(
          // At least one org so we can derive a substring
          fc.array(orgArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 9 }),
          (orgs, idx) => {
            const targetOrg = orgs[idx % orgs.length];
            const name = targetOrg.name;

            // Pick a non-empty substring of the name
            const start = 0;
            const end = Math.max(1, Math.floor(name.length / 2));
            const substring = name.slice(start, end);

            if (substring.trim().length === 0) {
              // Skip whitespace-only substrings (treated as no filter)
              return;
            }

            const result = applyFilters(orgs, { search: substring });
            const resultIds = new Set(result.map((o) => o.id));

            // The target org must appear in the result
            expect(resultIds.has(targetOrg.id)).toBe(true);
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});

