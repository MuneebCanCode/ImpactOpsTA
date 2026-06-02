import { z } from "zod";

/**
 * Reusable email field used for member invitations.
 *
 * Trimming first means surrounding whitespace never causes a false rejection,
 * and `.email()` enforces a well-formed address. This same shape is intended to
 * be re-applied by the invite-member Edge Function so client and server agree on
 * exactly which inputs are valid (see Requirements 7.2 / 7.3).
 */
export const inviteEmailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

/**
 * Validates the invite form submitted from the Org_Detail_View.
 *
 * _Requirements: 7.2 — the Frontend validates the invite email format using a
 * Zod schema before submission._
 */
export const inviteMemberSchema = z.object({
  email: inviteEmailSchema,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
