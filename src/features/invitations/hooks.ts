import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { memberKeys } from "@/features/members/hooks";
import { organizationKeys } from "@/features/organizations/hooks";
import type { OrganizationMember } from "@/types/database";

/**
 * Invitation-acceptance server-state hook (React Query).
 *
 * An invitation IS the `organization_members` row created by the invite flow
 * (status `invited`, `user_id` null until accepted). The acceptance link carries
 * that row's `id`, and `useAcceptInvitation` links the signed-in user to it:
 *
 *   - sets `user_id` to the accepting user        (Requirement 16.1)
 *   - transitions `status` from `invited` -> `active` and stamps `joined_at`
 *     (Requirement 16.2)
 *   - leaves `organization_id` and `email` untouched (design Property 18)
 *
 * Acceptance is an UPDATE, never an insert/upsert, so it can NEVER create a row;
 * and the update is guarded to rows still in `invited` status so it can never
 * re-activate an already-accepted invitation. A reference that is non-existent
 * or already accepted yields an informative {@link AcceptInvitationError} and
 * mutates nothing (Requirement 16.3, design Property 19).
 *
 * On success both caches are invalidated so the now-active member is reflected
 * everywhere: `['members', orgId]` (the org's members list) and
 * `['organizations']` (directory member counts).
 *
 * _Requirements: 16.1, 16.2, 16.3_
 */

/* ------------------------------------------------------------------------- */
/* User-facing messages                                                      */
/* ------------------------------------------------------------------------- */

/** Shown when the acceptance link carries no invitation identifier. */
export const MISSING_INVITATION_MESSAGE =
  "This invitation link is missing its identifier. Please use the link from " +
  "your invitation email.";

/** Shown when acceptance is attempted without an authenticated user. */
export const NOT_AUTHENTICATED_MESSAGE =
  "Sign in or create an account to accept this invitation.";

/** Shown when no invitation exists for the given identifier. */
export const INVITATION_NOT_FOUND_MESSAGE =
  "This invitation link is invalid or no longer exists.";

/** Shown when the invitation has already been accepted. */
export const INVITATION_ALREADY_ACCEPTED_MESSAGE =
  "This invitation has already been accepted.";

/** Fallback for unexpected read/update failures. */
export const ACCEPT_INVITATION_GENERIC_MESSAGE =
  "The invitation could not be accepted. Please try again.";

/* ------------------------------------------------------------------------- */
/* Error type                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Error raised when an invitation cannot be accepted. Its `message` is always a
 * presentable, informative string (one of the constants above) so the
 * AcceptInvitePage can render it directly as the error state (Requirement 16.3).
 */
export class AcceptInvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptInvitationError";
  }
}

/* ------------------------------------------------------------------------- */
/* Hook                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Accept an invitation by its `organization_members` row id, linking the
 * signed-in user to the existing Member record (Requirements 16.1, 16.2).
 *
 * The mutation variable is the invitation id read from the acceptance URL. The
 * flow is read-then-guarded-update so the two invalid cases (Requirement 16.3)
 * get distinct, informative messages:
 *
 *   1. Resolve the current user; absence is a (defensive) auth error.
 *   2. Read the row by id. A missing row -> "invalid or no longer exists".
 *   3. A row already linked/active -> "already accepted".
 *   4. Otherwise UPDATE guarded by `status = 'invited'` (race-safe) setting
 *      `user_id`, `status = 'active'`, and `joined_at`. If the guarded update
 *      matches no row (someone accepted in between), treat as already accepted.
 *
 * Because the write is an UPDATE filtered to the existing invited row, the
 * organization reference and email are left unchanged and no record is ever
 * created (design Property 18).
 */
export function useAcceptInvitation(): UseMutationResult<
  OrganizationMember,
  AcceptInvitationError,
  string
> {
  const queryClient = useQueryClient();

  return useMutation<OrganizationMember, AcceptInvitationError, string>({
    mutationFn: async (invitationId) => {
      const id = invitationId?.trim();
      if (!id) {
        throw new AcceptInvitationError(MISSING_INVITATION_MESSAGE);
      }

      // 1. The accepting user must be authenticated so we can link the account
      //    to the Member record (Requirement 16.1).
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new AcceptInvitationError(NOT_AUTHENTICATED_MESSAGE);
      }

      // 2. Read the invitation. `maybeSingle` returns null (not an error) when
      //    no row matches, which is the "non-existent" case (Requirement 16.3).
      const { data: existing, error: readError } = await supabase
        .from("organization_members")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (readError) {
        throw new AcceptInvitationError(ACCEPT_INVITATION_GENERIC_MESSAGE);
      }
      if (!existing) {
        throw new AcceptInvitationError(INVITATION_NOT_FOUND_MESSAGE);
      }

      // 3. Already accepted: status is no longer `invited`, or it has already
      //    been linked/joined. Surface an informative error and mutate nothing
      //    (Requirement 16.3).
      const alreadyAccepted =
        existing.status !== "invited" ||
        existing.user_id !== null ||
        existing.joined_at !== null;
      if (alreadyAccepted) {
        throw new AcceptInvitationError(INVITATION_ALREADY_ACCEPTED_MESSAGE);
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from("organization_members")
        .update({
          user_id: user.id,
          status: "active" as const,
          joined_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select();

      if (updateError) {
        throw new AcceptInvitationError(ACCEPT_INVITATION_GENERIC_MESSAGE);
      }

      const updated = (updatedRows as OrganizationMember[] | null)?.[0];
      if (!updated) {
        // The update matched no row — re-read to distinguish "already accepted"
        // from an unexpected RLS block.
        const { data: recheck } = await supabase
          .from("organization_members")
          .select("status")
          .eq("id", id)
          .maybeSingle();
        if (recheck && recheck.status === "active") {
          throw new AcceptInvitationError(INVITATION_ALREADY_ACCEPTED_MESSAGE);
        }
        throw new AcceptInvitationError(ACCEPT_INVITATION_GENERIC_MESSAGE);
      }

      return updated;
    },
    onSuccess: (member) => {
      // Reflect the now-active member in the org's members list and refresh the
      // directory's member counts.
      void queryClient.invalidateQueries({
        queryKey: memberKeys.list(member.organization_id),
      });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}
