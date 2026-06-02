import { z } from "zod";

/**
 * Authentication validation schemas (Zod).
 *
 * These power client-side form validation for the sign-up and sign-in screens
 * via React Hook Form's Zod resolver. They are the single source of truth for
 * the "documented password policy" referenced by the requirements/design.
 *
 * _Requirements: 1.2, 1.4, 2.3_
 */

/**
 * Documented password policy.
 *
 * Kept intentionally simple and production-minded:
 * - At least 8 characters so passwords are not trivially guessable.
 * - At most 72 characters, matching bcrypt's effective input limit (Supabase
 *   Auth hashes passwords with bcrypt, which silently truncates beyond 72 bytes,
 *   so accepting longer values would be misleading).
 *
 * Exported so tests (and any server-side re-validation) can assert against the
 * same constants rather than duplicating magic numbers.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Email field shared by sign-up and sign-in. Trims surrounding whitespace before
 * validating format so that an otherwise-valid address is not rejected for stray
 * spaces (Requirements 1.2, 2.3).
 */
const emailField = z
  .string()
  .trim()
  .min(1, { message: "Email is required" })
  .email({ message: "Enter a valid email address" });

/**
 * Password field for sign-up, enforcing the documented password policy
 * (Requirements 1.2, 1.4).
 */
const signUpPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  });

/**
 * Sign-up form schema: validates email format and the password policy before
 * submission (Requirements 1.2, 1.4).
 */
export const signUpSchema = z.object({
  email: emailField,
  password: signUpPasswordField,
});

/**
 * Sign-in form schema: validates the email format (Requirement 2.3). The
 * password is only required to be present here — the policy is enforced at
 * sign-up, and existing credentials must not be rejected for failing a policy
 * that may have changed.
 */
export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: "Password is required" }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
