import { z } from "zod";

/**
 * Organization validation schema (Zod).
 *
 * Powers client-side validation of the "create organization" form via React
 * Hook Form's Zod resolver, and is the client half of the soundness property
 * that must agree with the server-side database constraints.
 *
 * The canonical `type` values are the lowercase database enum members
 * (`public.org_type` = `'school' | 'nonprofit' | 'business'`). Keeping the
 * schema in the database's value space means the validated output can be
 * persisted directly and that the client's accept/reject decision lines up with
 * the server-side `school_requires_district` CHECK constraint
 * (`type <> 'school' OR length(trim(school_district)) > 0`). Human-readable
 * labels (School / Nonprofit / Business) are a presentation concern and are
 * exposed separately as `ORG_TYPE_LABELS` / `ORG_TYPE_OPTIONS` for the form.
 *
 * The type-specific rule (school_district required only when type is School) is
 * modeled with a Zod discriminated union: the School branch makes
 * `school_district` a required, non-empty field, while the Nonprofit and
 * Business branches omit it entirely so any stray value is stripped rather than
 * persisted. This makes the conditional requirement part of the static type as
 * well as the runtime validation.
 *
 * _Requirements: 5.2, 6.3_
 */

/**
 * Canonical Organization_Type values, matching the `public.org_type` Postgres
 * enum exactly (Requirement 10.5). Declared `as const` so it doubles as the
 * literal-union source of truth for {@link OrgType}.
 */
export const ORG_TYPES = ["school", "nonprofit", "business"] as const;

/**
 * Union of the canonical Organization_Type values.
 */
export type OrgType = (typeof ORG_TYPES)[number];

/**
 * Human-readable labels for each Organization_Type, used by the creation form's
 * type selector and (downstream) the type badge. Kept here so the schema
 * remains the single source of truth for the set of types.
 */
export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  school: "School",
  nonprofit: "Nonprofit",
  business: "Business",
};

/**
 * Select options derived from {@link ORG_TYPES}, preserving declaration order.
 */
export const ORG_TYPE_OPTIONS: ReadonlyArray<{ value: OrgType; label: string }> =
  ORG_TYPES.map((value) => ({ value, label: ORG_TYPE_LABELS[value] }));

/**
 * Organization name: required and non-empty after trimming surrounding
 * whitespace, so whitespace-only names are rejected. Mirrors the database
 * `check (length(trim(name)) > 0)` constraint (Requirement 5.2).
 */
const nameField = z
  .string()
  .trim()
  .min(1, { message: "Organization name is required" });

/**
 * School District: required and non-empty after trimming. Only present on the
 * School branch of the union, mirroring the server-side
 * `school_requires_district` CHECK (Requirement 6.3, 6.4).
 */
const schoolDistrictField = z
  .string()
  .trim()
  .min(1, { message: "School district is required for schools" });

const schoolOrganizationSchema = z.object({
  name: nameField,
  type: z.literal("school"),
  school_district: schoolDistrictField,
});

const nonprofitOrganizationSchema = z.object({
  name: nameField,
  type: z.literal("nonprofit"),
});

const businessOrganizationSchema = z.object({
  name: nameField,
  type: z.literal("business"),
});

/**
 * Create-organization schema (Requirements 5.2, 6.3).
 *
 * Accepts an input iff:
 * - `name` is non-empty after trimming,
 * - `type` is one of School / Nonprofit / Business, and
 * - when `type` is School, `school_district` is non-empty after trimming.
 *
 * The discriminated union on `type` produces the precise, type-driven shape:
 * the School variant requires `school_district`; the other variants do not
 * include it.
 */
export const createOrganizationSchema = z.discriminatedUnion("type", [
  schoolOrganizationSchema,
  nonprofitOrganizationSchema,
  businessOrganizationSchema,
]);

/**
 * Validated create-organization input. A discriminated union, so TypeScript
 * narrows `school_district` to a required field only when `type === "school"`.
 */
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
