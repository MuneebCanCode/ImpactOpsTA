import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";

import { AuthErrorBanner, AuthField } from "@/features/auth/AuthFormLayout";
import {
  inviteMemberSchema,
  type InviteMemberInput,
} from "@/features/members/schemas";
import { useInviteMember } from "@/features/members/hooks";
import { cn } from "@/lib/utils";

/**
 * Invite-member form rendered inside the Org_Detail_View (Requirements 7.2,
 * 7.6).
 *
 * The single email field is wired to the canonical {@link inviteMemberSchema}
 * through React Hook Form's Zod resolver, so an ill-formed address is caught
 * client-side and submission is blocked with a field-level message before any
 * request is made (Requirement 7.2). On submit the {@link useInviteMember}
 * mutation calls the privileged `invite-member` Edge Function; on success the
 * hook invalidates both the members list and the directory caches so the new
 * member appears without a reload (Requirement 7.6), and we reset the field so
 * the admin can immediately invite another person.
 *
 * Server-side rejections are surfaced precisely: {@link useInviteMember} already
 * normalizes the Edge Function's response into an `InviteMemberError` whose
 * `.message` maps 400 (invalid email), 403 (not permitted), and 409 (duplicate)
 * to user-facing text. We render that message in an {@link AuthErrorBanner}
 * rather than collapsing every failure into one generic line.
 *
 * While the request is in flight the submit control is disabled and shows a
 * spinner so the action can't be double-fired.
 */
export type InviteMemberFormProps = {
  /** Organization the invitation targets; forwarded to {@link useInviteMember}. */
  orgId: string;
};

const DEFAULT_VALUES: InviteMemberInput = { email: "" };

export function InviteMemberForm({ orgId }: InviteMemberFormProps) {
  const inviteMember = useInviteMember(orgId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    mode: "onSubmit",
    defaultValues: DEFAULT_VALUES,
  });

  // Zod validation must pass before this runs, so an invalid email never
  // reaches the mutation (Req 7.2).
  const onSubmit = handleSubmit((values) => {
    inviteMember.mutate(values, {
      onSuccess: () => {
        // Req 7.6: the hook already invalidated the caches so the new member
        // shows up; clear the field so another invite can be sent right away.
        reset(DEFAULT_VALUES);
      },
    });
  });

  // The hook hands back an InviteMemberError whose message already maps
  // 400/403/409 to user-facing text — surface it verbatim (Req 7.6 feedback).
  const mutationError = inviteMember.error ? inviteMember.error.message : null;

  const isSubmitting = inviteMember.isPending;

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <AuthErrorBanner message={mutationError} />

      <AuthField
        id="invite-email"
        label="Invite by email"
        type="email"
        autoComplete="off"
        placeholder="teammate@example.com"
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className={cn(
          "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md",
          "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
          "hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{isSubmitting ? "Sending invite…" : "Send invite"}</span>
      </button>
    </form>
  );
}

export default InviteMemberForm;
