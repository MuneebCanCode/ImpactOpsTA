import { useEffect, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import {
  MISSING_INVITATION_MESSAGE,
  NOT_AUTHENTICATED_MESSAGE,
  useAcceptInvitation,
} from "@/features/invitations/hooks";

/**
 * Public invitation-acceptance screen (Requirement 16).
 *
 * The invitation is identified by the `id` query parameter on the public
 * `/accept-invite` route (e.g. `/accept-invite?id=<organization_members.id>`),
 * which is the id of the `organization_members` row created by the invite flow.
 *
 * Acceptance requires an authenticated user (the account being linked to the
 * Member record), so:
 *   - while auth is resolving, a loading state is shown;
 *   - when no session exists, the page prompts the visitor to sign in or sign
 *     up rather than attempting acceptance;
 *   - when authenticated and an id is present, {@link useAcceptInvitation} runs
 *     automatically and the page renders clear loading / success / error states.
 *
 * A non-existent or already-accepted invitation surfaces an informative error
 * state (Requirement 16.3).
 */
export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const invitationId = searchParams.get("id")?.trim() ?? "";

  const { session, isLoading: isAuthLoading } = useAuth();
  const acceptInvitation = useAcceptInvitation();

  const { mutate } = acceptInvitation;
  useEffect(() => {
    if (isAuthLoading) return;
    if (!session) return;
    if (!invitationId) return;
    // Only fire if mutation hasn't started yet.
    if (acceptInvitation.isPending || acceptInvitation.isSuccess || acceptInvitation.isError) return;

    mutate(invitationId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, session, invitationId]);

  return (
    <AcceptInviteLayout>
      {renderBody()}
    </AcceptInviteLayout>
  );

  function renderBody(): ReactNode {
    // No identifier in the link: nothing to accept (Requirement 16.3).
    if (!invitationId) {
      return (
        <StatusCard
          tone="error"
          title="Invalid invitation link"
          message={MISSING_INVITATION_MESSAGE}
        />
      );
    }

    // Wait for auth to resolve before deciding between "sign in" and "accept".
    if (isAuthLoading) {
      return <StatusCard tone="loading" title="Loading…" />;
    }

    // Unauthenticated: prompt sign-in / sign-up. The id stays in the URL so the
    // visitor can return to this link after authenticating.
    if (!session) {
      return (
        <StatusCard
          tone="error"
          title="Sign in to accept"
          message={NOT_AUTHENTICATED_MESSAGE}
        >
          <div className="flex flex-col gap-2">
            <Link
              to="/sign-up"
              className={cn(
                "inline-flex h-9 w-full items-center justify-center rounded-md",
                "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              Create an account
            </Link>
            <Link
              to="/sign-in"
              className={cn(
                "inline-flex h-9 w-full items-center justify-center rounded-md border border-input",
                "bg-background px-4 text-sm font-medium shadow-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none",
                "focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              Sign in
            </Link>
          </div>
        </StatusCard>
      );
    }

    // Authenticated: reflect the mutation state.
    if (acceptInvitation.isSuccess) {
      return (
        <StatusCard
          tone="success"
          title="Invitation accepted"
          message="You are now an active member of the organization."
        >
          <Link
            to="/member"
            className={cn(
              "inline-flex h-9 w-full items-center justify-center rounded-md",
              "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            Go to dashboard
          </Link>
        </StatusCard>
      );
    }

    if (acceptInvitation.isError) {
      return (
        <StatusCard
          tone="error"
          title="Could not accept invitation"
          message={acceptInvitation.error.message}
        >
          <button
            type="button"
            onClick={() => acceptInvitation.mutate(invitationId)}
            disabled={acceptInvitation.isPending}
            className={cn(
              "inline-flex h-9 w-full items-center justify-center rounded-md border border-input",
              "bg-background px-4 text-sm font-medium shadow-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none",
              "focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            Try again
          </button>
        </StatusCard>
      );
    }

    // Pending (or the brief moment before the effect fires).
    return (
      <StatusCard tone="loading" title="Accepting your invitation…" />
    );
  }
}

export default AcceptInvitePage;

/* ------------------------------------------------------------------------- */
/* Presentational helpers                                                    */
/* ------------------------------------------------------------------------- */

/** Centered public-page shell, consistent with the auth screens. */
function AcceptInviteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold">Impact Operations TA</span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}

type StatusTone = "loading" | "success" | "error";

/**
 * A single status presentation used for every state of the flow so loading,
 * success, and error read consistently. `aria-live`/`role` are set so each
 * transition is announced to assistive tech.
 */
function StatusCard({
  tone,
  title,
  message,
  children,
}: {
  tone: StatusTone;
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center gap-4 text-center"
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-busy={tone === "loading" ? true : undefined}
      data-accept-state={tone}
    >
      <StatusIcon tone={tone} />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>
      {children ? <div className="w-full">{children}</div> : null}
    </div>
  );
}

function StatusIcon({ tone }: { tone: StatusTone }) {
  if (tone === "loading") {
    return (
      <Loader2
        className="h-8 w-8 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    );
  }
  if (tone === "success") {
    return <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />;
  }
  return <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />;
}
