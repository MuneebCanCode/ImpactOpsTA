// Feature: admin-org-dashboard, Property 1: Auth credential validation soundness

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ZodError, z } from "zod";
import {
  signUpSchema,
  signInSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./schemas";

/**
 * Property 1: Auth credential validation soundness
 * Validates: Requirements 1.2, 1.4, 2.3
 *
 * For any candidate email string and password string, the auth Zod schema SHALL
 * accept the input if and only if the email is a well-formed address and the
 * password satisfies the documented password policy; and for any input the schema
 * rejects, the form submit handler SHALL NOT be invoked and field-level error
 * messages SHALL be present (ZodError, not a throw).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A standalone Zod email validator that mirrors the emailField in schemas.ts. */
const zodEmailCheck = z.string().trim().min(1).email();

/** Returns true when Zod considers the (trimmed) string a valid email. */
function isZodValidEmail(email: string): boolean {
  return zodEmailCheck.safeParse(email).success;
}

/** Returns true when the password satisfies the sign-up policy [8, 72]. */
function isValidSignUpPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

/** Returns true when the password satisfies the sign-in policy (non-empty). */
function isValidSignInPassword(password: string): boolean {
  return password.length >= 1;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates well-formed email addresses that Zod's .email() validator accepts.
 * fc.emailAddress() follows RFC 5321 which is broader than Zod's validator, so
 * we filter to only those Zod accepts.
 */
const validEmailArb = fc
  .emailAddress()
  .filter((email) => isZodValidEmail(email));

/**
 * Generates strings that are NOT valid emails according to Zod.
 * We use several patterns that are reliably invalid.
 */
const invalidEmailArb = fc.oneof(
  // Plain strings without '@' are never valid emails.
  fc.string({ minLength: 0, maxLength: 50 }).filter((s) => !s.includes("@")),
  // Strings with '@' but no domain part.
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => `${s}@`),
  // Just '@'.
  fc.constant("@"),
  // Empty string.
  fc.constant(""),
  // Whitespace only.
  fc.constant("   "),
  // Missing TLD.
  fc.string({ minLength: 1, maxLength: 10 }).map((s) => `${s}@nodot`),
);

/**
 * Generates passwords that satisfy the sign-up policy [8, 72].
 * We use printable ASCII to avoid any encoding edge cases.
 */
const validSignUpPasswordArb = fc.string({
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  unit: "grapheme-ascii",
});

/**
 * Generates passwords that violate the sign-up policy (too short or too long).
 */
const invalidSignUpPasswordArb = fc.oneof(
  // Too short (0–7 chars).
  fc.string({ minLength: 0, maxLength: PASSWORD_MIN_LENGTH - 1, unit: "grapheme-ascii" }),
  // Too long (73+ chars).
  fc.string({ minLength: PASSWORD_MAX_LENGTH + 1, maxLength: 100, unit: "grapheme-ascii" }),
);

/** Generates non-empty passwords (valid for sign-in). */
const validSignInPasswordArb = fc.string({
  minLength: 1,
  maxLength: 100,
  unit: "grapheme-ascii",
});

/** Generates empty passwords (invalid for sign-in). */
const emptyPasswordArb = fc.constant("");

// ---------------------------------------------------------------------------
// Property 1a: signUpSchema — accept iff email valid AND password in [8, 72]
// ---------------------------------------------------------------------------

describe("Property 1: Auth credential validation soundness — signUpSchema", () => {
  it(
    "accepts when email is valid AND password length is in [8, 72]",
    () => {
      fc.assert(
        fc.property(validEmailArb, validSignUpPasswordArb, (email, password) => {
          const result = signUpSchema.safeParse({ email, password });
          expect(result.success).toBe(true);
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects with ZodError (not a throw) when email is invalid, regardless of password",
    () => {
      fc.assert(
        fc.property(invalidEmailArb, validSignUpPasswordArb, (email, password) => {
          const result = signUpSchema.safeParse({ email, password });
          // Must not throw — safeParse always returns a result object.
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            const emailErrors = result.error.issues.filter(
              (i) => i.path[0] === "email",
            );
            expect(emailErrors.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects with ZodError (not a throw) when password is too short or too long, regardless of email",
    () => {
      fc.assert(
        fc.property(validEmailArb, invalidSignUpPasswordArb, (email, password) => {
          const result = signUpSchema.safeParse({ email, password });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            const passwordErrors = result.error.issues.filter(
              (i) => i.path[0] === "password",
            );
            expect(passwordErrors.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects with ZodError (not a throw) when both email is invalid AND password violates policy",
    () => {
      fc.assert(
        fc.property(invalidEmailArb, invalidSignUpPasswordArb, (email, password) => {
          const result = signUpSchema.safeParse({ email, password });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            expect(result.error.issues.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "accept-iff-valid: signUpSchema result matches (isZodValidEmail AND isValidSignUpPassword)",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(validEmailArb, invalidEmailArb),
          fc.oneof(validSignUpPasswordArb, invalidSignUpPasswordArb),
          (email, password) => {
            const result = signUpSchema.safeParse({ email, password });
            const expectedValid =
              isZodValidEmail(email) && isValidSignUpPassword(password);
            expect(result.success).toBe(expectedValid);
            // Rejected inputs must produce a ZodError, never throw.
            if (!result.success) {
              expect(result.error).toBeInstanceOf(ZodError);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 1b: signInSchema — accept iff email valid AND password non-empty
// ---------------------------------------------------------------------------

describe("Property 1: Auth credential validation soundness — signInSchema", () => {
  it(
    "accepts when email is valid AND password is non-empty",
    () => {
      fc.assert(
        fc.property(validEmailArb, validSignInPasswordArb, (email, password) => {
          const result = signInSchema.safeParse({ email, password });
          expect(result.success).toBe(true);
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects with ZodError (not a throw) when email is invalid, regardless of password",
    () => {
      fc.assert(
        fc.property(invalidEmailArb, validSignInPasswordArb, (email, password) => {
          const result = signInSchema.safeParse({ email, password });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            const emailErrors = result.error.issues.filter(
              (i) => i.path[0] === "email",
            );
            expect(emailErrors.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects with ZodError (not a throw) when password is empty, regardless of email",
    () => {
      fc.assert(
        fc.property(validEmailArb, emptyPasswordArb, (email, password) => {
          const result = signInSchema.safeParse({ email, password });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeInstanceOf(ZodError);
            const passwordErrors = result.error.issues.filter(
              (i) => i.path[0] === "password",
            );
            expect(passwordErrors.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 25 },
      );
    },
  );

  it(
    "accept-iff-valid: signInSchema result matches (isZodValidEmail AND password non-empty)",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(validEmailArb, invalidEmailArb),
          fc.oneof(validSignInPasswordArb, emptyPasswordArb),
          (email, password) => {
            const result = signInSchema.safeParse({ email, password });
            const expectedValid =
              isZodValidEmail(email) && isValidSignInPassword(password);
            expect(result.success).toBe(expectedValid);
            // Rejected inputs must produce a ZodError, never throw.
            if (!result.success) {
              expect(result.error).toBeInstanceOf(ZodError);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 1c: Boundary lengths for sign-up password
// ---------------------------------------------------------------------------

describe("Property 1: Auth credential validation soundness — password boundary lengths", () => {
  it(
    "accepts passwords of exactly PASSWORD_MIN_LENGTH (8) characters",
    () => {
      fc.assert(
        fc.property(
          validEmailArb,
          fc.string({
            minLength: PASSWORD_MIN_LENGTH,
            maxLength: PASSWORD_MIN_LENGTH,
            unit: "grapheme-ascii",
          }),
          (email, password) => {
            const result = signUpSchema.safeParse({ email, password });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "accepts passwords of exactly PASSWORD_MAX_LENGTH (72) characters",
    () => {
      fc.assert(
        fc.property(
          validEmailArb,
          fc.string({
            minLength: PASSWORD_MAX_LENGTH,
            maxLength: PASSWORD_MAX_LENGTH,
            unit: "grapheme-ascii",
          }),
          (email, password) => {
            const result = signUpSchema.safeParse({ email, password });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects passwords of PASSWORD_MIN_LENGTH - 1 (7) characters",
    () => {
      fc.assert(
        fc.property(
          validEmailArb,
          fc.string({
            minLength: PASSWORD_MIN_LENGTH - 1,
            maxLength: PASSWORD_MIN_LENGTH - 1,
            unit: "grapheme-ascii",
          }),
          (email, password) => {
            const result = signUpSchema.safeParse({ email, password });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it(
    "rejects passwords of PASSWORD_MAX_LENGTH + 1 (73) characters",
    () => {
      fc.assert(
        fc.property(
          validEmailArb,
          fc.string({
            minLength: PASSWORD_MAX_LENGTH + 1,
            maxLength: PASSWORD_MAX_LENGTH + 1,
            unit: "grapheme-ascii",
          }),
          (email, password) => {
            const result = signUpSchema.safeParse({ email, password });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 1d: Unicode inputs do not cause throws
// ---------------------------------------------------------------------------

describe("Property 1: Auth credential validation soundness — unicode inputs", () => {
  it(
    "never throws on arbitrary unicode email inputs — always returns a ZodError or success",
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 80 }),
          fc.string({ minLength: 0, maxLength: 80 }),
          (email, password) => {
            // Must never throw — safeParse is the contract.
            expect(() => signUpSchema.safeParse({ email, password })).not.toThrow();
            const result = signUpSchema.safeParse({ email, password });
            if (!result.success) {
              expect(result.error).toBeInstanceOf(ZodError);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    "never throws on arbitrary unicode sign-in inputs — always returns a ZodError or success",
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 80 }),
          fc.string({ minLength: 0, maxLength: 80 }),
          (email, password) => {
            expect(() => signInSchema.safeParse({ email, password })).not.toThrow();
            const result = signInSchema.safeParse({ email, password });
            if (!result.success) {
              expect(result.error).toBeInstanceOf(ZodError);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

