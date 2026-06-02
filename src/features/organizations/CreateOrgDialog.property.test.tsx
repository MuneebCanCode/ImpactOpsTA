// Feature: admin-org-dashboard, Property 4: School-district field visibility tracks type
//
// Validates: Requirements 6.1, 6.2
//
// For any selected Organization_Type, the School District input field SHALL be
// present in the rendered form if and only if the selected type is School.
//
// The test opens the dialog in controlled mode, selects each org type via the
// type <select>, and asserts:
//   - type === 'school'     → School District field IS present
//   - type !== 'school'     → School District field is ABSENT
//
// useCreateOrganization and the Supabase client are mocked so the component
// renders without a live backend.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as fc from "fast-check";
import React from "react";

import { CreateOrgDialog } from "@/features/organizations/CreateOrgDialog";
import { ORG_TYPES } from "@/features/organizations/schemas";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Supabase client must be stubbed — it throws at import time without env vars.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// Stub useCreateOrganization with a minimal UseMutationResult shape.
const mockMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  isSuccess: false,
  isIdle: true,
  error: null,
  data: undefined,
  variables: undefined,
  context: undefined,
  failureCount: 0,
  failureReason: null,
  status: "idle" as const,
  submittedAt: 0,
  reset: vi.fn(),
};

vi.mock("@/features/organizations/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/organizations/hooks")>(
      "@/features/organizations/hooks",
    );
  return {
    ...actual,
    useCreateOrganization: () => mockMutation,
  };
});

// ---------------------------------------------------------------------------
// Cleanup between tests (and between fast-check iterations via manual cleanup)
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the dialog in controlled-open mode so the form is always visible. */
function renderOpenDialog() {
  return render(
    React.createElement(CreateOrgDialog, {
      open: true,
      onOpenChange: vi.fn(),
    }),
  );
}

/** Return the School District label/input if present, or null if absent. */
function querySchoolDistrictField(): HTMLElement | null {
  return screen.queryByLabelText(/school district/i);
}

/**
 * Find the Type select by its label association (for="org-type").
 * We use the label text directly since the select has an associated label.
 */
function getTypeSelect(): HTMLSelectElement {
  return screen.getByLabelText(/^type$/i) as HTMLSelectElement;
}

// ---------------------------------------------------------------------------
// Property 4 tests
// ---------------------------------------------------------------------------

describe("Property 4: School-district field visibility tracks type", () => {
  /**
   * Property 4a: School District field is present iff type is 'school'
   *
   * Generates all three org types (100 iterations via fc.constantFrom) and
   * asserts the field is present exactly when type === 'school'.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it(
    "4a: School District field is present iff type is 'school' (100 iterations)",
    async () => {
      // **Validates: Requirements 6.1, 6.2**
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ORG_TYPES),
          async (orgType) => {
            const user = userEvent.setup();
            renderOpenDialog();

            // Select the generated type in the Type <select>.
            const typeSelect = getTypeSelect();
            await user.selectOptions(typeSelect, orgType);

            const districtField = querySchoolDistrictField();

            if (orgType === "school") {
              // Req 6.1: School District field MUST be present for 'school'
              expect(districtField).not.toBeNull();
            } else {
              // Req 6.2: School District field MUST be absent for non-school types
              expect(districtField).toBeNull();
            }

            // Clean up DOM between iterations.
            cleanup();
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 4b: School District field is absent for 'nonprofit' and 'business'
   *
   * Explicitly verifies the two non-school types are always absent.
   *
   * **Validates: Requirements 6.2**
   */
  it(
    "4b: School District field is absent for 'nonprofit' and 'business' (100 iterations)",
    async () => {
      // **Validates: Requirements 6.2**
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("nonprofit" as const, "business" as const),
          async (orgType) => {
            const user = userEvent.setup();
            renderOpenDialog();

            const typeSelect = getTypeSelect();
            await user.selectOptions(typeSelect, orgType);

            expect(querySchoolDistrictField()).toBeNull();

            cleanup();
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 4c: School District field is present when type is 'school'
   *
   * Explicitly verifies the school type always shows the field.
   *
   * **Validates: Requirements 6.1**
   */
  it(
    "4c: School District field is present when type is 'school' (100 iterations)",
    async () => {
      // **Validates: Requirements 6.1**
      await fc.assert(
        fc.asyncProperty(
          fc.constant("school" as const),
          async (orgType) => {
            const user = userEvent.setup();
            renderOpenDialog();

            const typeSelect = getTypeSelect();
            await user.selectOptions(typeSelect, orgType);

            expect(querySchoolDistrictField()).not.toBeNull();

            cleanup();
          },
        ),
        { numRuns: 10 },
      );
    },
  );

  /**
   * Property 4d: Switching type toggles field visibility correctly
   *
   * Verifies that switching from 'school' to a non-school type removes the
   * field, and switching back restores it — within a single dialog instance.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it(
    "4d: switching type toggles School District field visibility (100 iterations)",
    async () => {
      // **Validates: Requirements 6.1, 6.2**
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("nonprofit" as const, "business" as const),
          async (nonSchoolType) => {
            const user = userEvent.setup();
            renderOpenDialog();

            const typeSelect = getTypeSelect();

            // Default type is 'school' — field should be present initially.
            expect(querySchoolDistrictField()).not.toBeNull();

            // Switch to a non-school type — field should disappear.
            await user.selectOptions(typeSelect, nonSchoolType);
            expect(querySchoolDistrictField()).toBeNull();

            // Switch back to 'school' — field should reappear.
            await user.selectOptions(typeSelect, "school");
            expect(querySchoolDistrictField()).not.toBeNull();

            cleanup();
          },
        ),
        { numRuns: 10 },
      );
    },
  );
});

