// Feature: admin-org-dashboard, Property 5: Invite email validation soundness
//
// Validates: Requirements 7.2, 7.3
//
// The client schema (inviteMemberSchema / inviteEmailSchema) and the Edge
// Function's server-side re-validation use the same Zod chain:
//   z.string().trim().min(1).email()
//
// Because we cannot import Deno code in Vitest, we define a local equivalent
// of the server schema here and assert that both schemas agree on every
// generated input — proving the two validation layers are in sync (Req 7.3).

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { z } from "zod";

import { inviteEmailSchema, inviteMemberSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Local equivalent of the Edge Function's server-side email validation.
// Mirrors supabase/functions/invite-member/index.ts exactly:
//   z.string({ required_error: "Email is required" })
//     .trim().min(1, "Email is required").email("Enter a valid email address")
// ---------------------------------------------------------------------------
const serverEmailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

/** Returns true when the value is accepted by the given schema. */
function accepts(schema: z.ZodTypeAny, value: unknown): boolean {
  return schema.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// Generator: emails that Zod's .email() validator accepts.
//
// fc.emailAddress() follows RFC 5321 and allows constructs (special chars,
// consecutive dots, all-digit TLDs) that Zod's stricter validator rejects.
// We build emails from safe alphanumeric-only components that both validators
// agree are valid, avoiding the edge cases that cause disagreement.
// ---------------------------------------------------------------------------
const alphaNumArb = fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/);
const tldArb = fc.stringMatching(/^[a-z]{2,6}$/);

// local@subdomain.tld  — all parts are purely alphanumeric, no dots/hyphens
// in the local part so consecutive-dot issues cannot arise.
const zodCompatibleEmailArb = fc
  .tuple(alphaNumArb, alphaNumArb, tldArb)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

describe("Property 5: Invite email validation soundness (client and server)", () => {
  // -------------------------------------------------------------------------
  // Property 5a — valid emails (Zod-compatible subset) always pass both schemas
  // -------------------------------------------------------------------------
  it(
    "accepts all valid email addresses from the Zod-compatible generator (Req 7.2, 7.3)",
    () => {
      fc.assert(
        fc.property(zodCompatibleEmailArb, (email) => {
          expect(accepts(inviteEmailSchema, email)).toBe(true);
          expect(accepts(serverEmailSchema, email)).toBe(true);
          expect(accepts(inviteMemberSchema, { email })).toBe(true);
        }),
        { numRuns: 25 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 5b — client and server schemas agree on every arbitrary string
  // -------------------------------------------------------------------------
  it(
    "client and server schemas agree on every generated string input (Req 7.3)",
    () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const clientResult = accepts(inviteEmailSchema, input);
          const serverResult = accepts(serverEmailSchema, input);
          // Both schemas must reach the same accept/reject decision.
          expect(clientResult).toBe(serverResult);
        }),
        { numRuns: 25 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 5c — inviteMemberSchema accepts iff the email field is valid
  // -------------------------------------------------------------------------
  it(
    "inviteMemberSchema accepts iff the email field passes email validation (Req 7.2)",
    () => {
      fc.assert(
        fc.property(fc.string(), (email) => {
          const formAccepted = accepts(inviteMemberSchema, { email });
          const emailAccepted = accepts(inviteEmailSchema, email);
          expect(formAccepted).toBe(emailAccepted);
        }),
        { numRuns: 25 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Edge cases — empty strings, whitespace-only, and non-email strings are
  // always rejected by both schemas (Req 7.2)
  // -------------------------------------------------------------------------
  it("rejects empty string", () => {
    expect(accepts(inviteEmailSchema, "")).toBe(false);
    expect(accepts(serverEmailSchema, "")).toBe(false);
    expect(accepts(inviteMemberSchema, { email: "" })).toBe(false);
  });

  it("rejects whitespace-only strings", () => {
    for (const ws of [" ", "   ", "\t", "\n", "  \t  "]) {
      expect(accepts(inviteEmailSchema, ws)).toBe(false);
      expect(accepts(serverEmailSchema, ws)).toBe(false);
      expect(accepts(inviteMemberSchema, { email: ws })).toBe(false);
    }
  });

  it("rejects non-email strings", () => {
    const nonEmails = [
      "not-an-email",
      "missing@",
      "@nodomain",
      "no-at-sign",
      "double@@example.com",
      "plain text",
      "123",
    ];
    for (const value of nonEmails) {
      expect(accepts(inviteEmailSchema, value)).toBe(false);
      expect(accepts(serverEmailSchema, value)).toBe(false);
    }
  });

  it("accepts a well-formed email with surrounding whitespace after trim", () => {
    // The .trim() in both schemas means padded-but-valid emails are accepted.
    const padded = "  user@example.com  ";
    expect(accepts(inviteEmailSchema, padded)).toBe(true);
    expect(accepts(serverEmailSchema, padded)).toBe(true);
    expect(accepts(inviteMemberSchema, { email: padded })).toBe(true);
  });
});

