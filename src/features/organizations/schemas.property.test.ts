// Feature: admin-org-dashboard, Property 3: Organization creation validation soundness
//
// Validates: Requirements 5.2, 5.3, 5.4, 6.3, 6.4
//
// This property test verifies that the client-side Zod schema (createOrganizationSchema)
// accepts an input if and only if:
//   1. name is non-empty after trimming (mirrors DB: check (length(trim(name)) > 0))
//   2. type is one of the canonical ORG_TYPES ('school' | 'nonprofit' | 'business')
//   3. when type is 'school', school_district is non-empty after trimming
//      (mirrors DB: school_requires_district CHECK)
//
// The "server-side agreement" is modeled as a pure function that replicates the
// Postgres CHECK constraints from migration 0001_init_schema.sql, since the DB
// is not available in unit tests. The property asserts that the schema and the
// constraint function always agree.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createOrganizationSchema, ORG_TYPES, type OrgType } from "./schemas";

// ---------------------------------------------------------------------------
// Server-side constraint replica
// ---------------------------------------------------------------------------
// Mirrors the two Postgres CHECK constraints from organizations table:
//   1. check (length(trim(name)) > 0)
//   2. constraint school_requires_district
//        check (type <> 'school' or (school_district is not null and length(trim(school_district)) > 0))
//
// Returns true iff the row would pass both constraints.
function serverConstraintAccepts(input: {
  name: unknown;
  type: unknown;
  school_district?: unknown;
}): boolean {
  // name must be a non-empty string after trim
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return false;
  }
  // type must be a valid org_type enum value
  if (!ORG_TYPES.includes(input.type as OrgType)) {
    return false;
  }
  // school_requires_district: if type is 'school', district must be non-empty after trim
  if (input.type === "school") {
    if (
      typeof input.school_district !== "string" ||
      input.school_district.trim().length === 0
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Strings that include whitespace-only, empty, and normal content. */
const nameArb = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\t\n"),
  fc.string({ minLength: 1, maxLength: 80 }),
  // whitespace-padded valid names
  fc.string({ minLength: 1, maxLength: 40 }).map((s) => `  ${s}  `),
);

/** Org type values: valid ones plus invalid strings and non-strings. */
const typeArb = fc.oneof(
  // valid types
  fc.constantFrom(...ORG_TYPES),
  // invalid strings
  fc.constant("School"),
  fc.constant("SCHOOL"),
  fc.constant(""),
  fc.constant("university"),
  fc.string({ minLength: 1, maxLength: 20 }),
);

/** School district strings: empty, whitespace-only, and normal content. */
const districtArb = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\t"),
  fc.string({ minLength: 1, maxLength: 80 }),
  fc.string({ minLength: 1, maxLength: 40 }).map((s) => `  ${s}  `),
);

/** Full input object with all combinations. */
const inputArb = fc.record({
  name: nameArb,
  type: typeArb,
  school_district: fc.option(districtArb, { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property 3 tests
// ---------------------------------------------------------------------------

describe("Property 3: Organization creation validation soundness", () => {
  it(
    "schema accepts iff name is non-empty after trim, type is valid, and school has district",
    () => {
      // **Validates: Requirements 5.2, 5.3, 5.4, 6.3, 6.4**
      fc.assert(
        fc.property(inputArb, (input) => {
          const result = createOrganizationSchema.safeParse(input);
          const expected = serverConstraintAccepts(input);
          expect(result.success).toBe(expected);
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "whitespace-only names are always rejected",
    () => {
      // **Validates: Requirements 5.2, 5.3**
      const whitespaceNameArb = fc.oneof(
        fc.constant(""),
        fc.constant("   "),
        fc.constant("\t"),
        fc.constant("\n"),
        fc.constant("  \t  \n  "),
        // arbitrary whitespace strings
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 1,
            maxLength: 20,
          })
          .map((chars) => chars.join("")),
      );

      fc.assert(
        fc.property(
          whitespaceNameArb,
          fc.constantFrom(...ORG_TYPES),
          (name, type) => {
            const input =
              type === "school"
                ? { name, type, school_district: "Valid District" }
                : { name, type };
            const result = createOrganizationSchema.safeParse(input);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "whitespace-only school_district is rejected when type is school",
    () => {
      // **Validates: Requirements 6.3, 6.4**
      const whitespaceDistrictArb = fc.oneof(
        fc.constant(""),
        fc.constant("   "),
        fc.constant("\t"),
        fc.constant("\n"),
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 1,
            maxLength: 20,
          })
          .map((chars) => chars.join("")),
      );

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 80 }),
          whitespaceDistrictArb,
          (name, district) => {
            const input = { name, type: "school" as const, school_district: district };
            const result = createOrganizationSchema.safeParse(input);
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "school branch requires school_district; nonprofit and business branches do not",
    () => {
      // **Validates: Requirements 6.3, 6.4**
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 80 }),
          fc.string({ minLength: 1, maxLength: 80 }),
          (name, district) => {
            // School with valid district: accepted
            const schoolWithDistrict = createOrganizationSchema.safeParse({
              name,
              type: "school",
              school_district: district,
            });
            expect(schoolWithDistrict.success).toBe(true);

            // School without district: rejected
            const schoolWithoutDistrict = createOrganizationSchema.safeParse({
              name,
              type: "school",
            });
            expect(schoolWithoutDistrict.success).toBe(false);

            // Nonprofit without district: accepted
            const nonprofitWithoutDistrict = createOrganizationSchema.safeParse({
              name,
              type: "nonprofit",
            });
            expect(nonprofitWithoutDistrict.success).toBe(true);

            // Business without district: accepted
            const businessWithoutDistrict = createOrganizationSchema.safeParse({
              name,
              type: "business",
            });
            expect(businessWithoutDistrict.success).toBe(true);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "schema and server-side constraint agree on all valid school inputs",
    () => {
      // **Validates: Requirements 6.3, 6.4**
      // For school inputs with valid name and district, both must accept.
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 80 }),
          fc.string({ minLength: 1, maxLength: 80 }),
          (name, district) => {
            const input = { name, type: "school" as const, school_district: district };
            const schemaResult = createOrganizationSchema.safeParse(input);
            const constraintResult = serverConstraintAccepts(input);
            expect(schemaResult.success).toBe(constraintResult);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "validated output strips extra fields on nonprofit and business branches",
    () => {
      // **Validates: Requirements 5.4**
      // The discriminated union strips school_district from non-school branches.
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 80 }),
          fc.constantFrom("nonprofit" as const, "business" as const),
          fc.string({ minLength: 1, maxLength: 80 }),
          (name, type, district) => {
            const result = createOrganizationSchema.safeParse({
              name,
              type,
              school_district: district, // extra field — should be stripped
            });
            expect(result.success).toBe(true);
            if (result.success) {
              // school_district must not appear on the validated output for
              // non-school branches. The discriminated union narrows the type
              // at runtime via the `type` field, so we check that way.
              if (result.data.type !== "school") {
                expect(
                  Object.prototype.hasOwnProperty.call(result.data, "school_district"),
                ).toBe(false);
              }
            }
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});

