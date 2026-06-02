import { isAuthError, type AuthError } from "@supabase/supabase-js";

import { AuthSetupError } from "@/features/auth/hooks";

/**
 * Maps raw authentication errors to friendly, user-facing messages for the
 * sign-up and sign-in screens.
 *
 * The auth hooks surface Supabase Auth errors verbatim in `mutation.error`
 * (Requirements 1.10, 2.2). Those raw messages ("Invalid login credentials",
 * "User already registered", etc.) are terse and inconsistent. This module
 * translates the cases the requirements call out — a duplicate email on sign-up
 * (Requirement 1.3) and bad credentials on sign-in (Requirement 2.2) — into
 * clear guidance, while still surfacing a visible message for every other
 * error so nothing is swallowed silently.
 *
 * Detection prefers the structured `code` field (stable, locale-independent)
 * and falls back to message matching for older servers or pre-response errors
 * that arrive without a code.
 *
 * _Requirements: 1.3, 2.2_
 */

/** Shown when sign-up is attempted with an already-registered email (Req 1.3). */
export const DUPLICATE_EMAIL_MESSAGE =
  "That email is already registered. Try signing in instead.";

/** Shown when sign-in is attempted with a wrong email or password (Req 2.2). */
export const INVALID_CREDENTIALS_MESSAGE =
  "The email or password you entered is incorrect.";

/** Fallback when a sign-up error has no message we can surface directly. */
export const GENERIC_SIGN_UP_ERROR_MESSAGE =
  "We couldn't complete sign-up. Please try again.";

/** Fallback when a sign-in error has no message we can surface directly. */
export const GENERIC_SIGN_IN_ERROR_MESSAGE =
  "We couldn't sign you in. Please try again.";

/**
 * True when an Auth error represents an attempt to sign up with an email that
 * is already registered. GoTrue reports this as `email_exists` or
 * `user_already_exists`; the message fallback covers servers that predate codes.
 */
function isDuplicateEmailError(error: AuthError): boolean {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return true;
  }
  return /already (registered|in use|exists)/i.test(error.message);
}

/**
 * True when an Auth error represents bad sign-in credentials (wrong email or
 * password). GoTrue reports this as `invalid_credentials`.
 */
function isInvalidCredentialsError(error: AuthError): boolean {
  if (error.code === "invalid_credentials") {
    return true;
  }
  return /invalid login credentials|invalid email or password/i.test(
    error.message,
  );
}

/**
 * Translate a sign-up mutation error into a user-facing message, or `null` when
 * there is no error.
 *
 * Order of precedence:
 *  1. Duplicate-email Auth errors → the dedicated "already registered" message
 *     (Requirement 1.3).
 *  2. {@link AuthSetupError} (profile could not be confirmed) → its own message,
 *     which already advises the user to retry or contact support (Req 1.6).
 *  3. Any other error → its message, falling back to a generic line so the
 *     failure is always visible (Requirement 1.10).
 */
export function mapSignUpError(error: Error | null | undefined): string | null {
  if (!error) return null;

  if (isAuthError(error) && isDuplicateEmailError(error)) {
    return DUPLICATE_EMAIL_MESSAGE;
  }

  if (error instanceof AuthSetupError) {
    return error.message;
  }

  return error.message || GENERIC_SIGN_UP_ERROR_MESSAGE;
}

/**
 * Translate a sign-in mutation error into a user-facing message, or `null` when
 * there is no error.
 *
 * Bad-credential Auth errors map to a single, non-enumerating message
 * (Requirement 2.2); any other error surfaces its own message with a generic
 * fallback so it is never swallowed.
 */
export function mapSignInError(error: Error | null | undefined): string | null {
  if (!error) return null;

  if (isAuthError(error) && isInvalidCredentialsError(error)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return error.message || GENERIC_SIGN_IN_ERROR_MESSAGE;
}
