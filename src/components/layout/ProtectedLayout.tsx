import { useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";

import { useAuth, type Profile } from "@/providers/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

/**
 * The route to which unauthenticated visitors are redirected (Requirement 3.1).
 */
const SIGN_IN_ROUTE = "/sign-in";

/**
 * The shared layout wrapping every Protected_Route (Requirement 3).
 *
 * Gating order matters:
 *   1. While the initial session is still resolving, render a neutral loading
 *      state. We must NOT redirect here, otherwise an authenticated admin would
 *      flicker to the sign-in page on every refresh before `getSession()`
 *      resolves.
 *   2. Once auth state is known and there is no session, redirect to the
 *      sign-in route and render NO protected content (Requirements 3.1, 3.2).
 *      `<Navigate replace>` swaps the history entry so the back button does not
 *      return to the guarded URL.
 *   3. With an authenticated session, render the application chrome plus the
 *      matched route's content via `<Outlet />` (Requirement 3.3).
 *
 * Session expiry is handled upstream by the AuthProvider, which nulls the
 * session on `SIGNED_OUT`/expiry; that state change re-renders this layout into
 * the redirect branch on the next navigation (Requirement 3.4).
 */
export function ProtectedLayout() {
  const { session, user, profile, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!session) {
    return <Navigate to={SIGN_IN_ROUTE} replace />;
  }

  return (
    <AppChrome user={user} profile={profile}>
      <Outlet />
    </AppChrome>
  );
}

/**
 * A neutral, full-viewport loading state shown while the initial session is
 * being resolved. Renders no protected content and triggers no redirect.
 */
function FullPageSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="protected-layout-loading"
      className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

type AppChromeProps = {
  user: User | null;
  profile: Profile | null;
  children: ReactNode;
};

/**
 * The application chrome rendered around protected content for an authenticated
 * admin. Provides the persistent header with the signed-in identity display
 * (Requirement 4.1), a visible sign-out control (Requirement 4.2), and the
 * theme toggle (Requirement 15.1).
 */
export function AppChrome({ user, profile, children }: AppChromeProps) {
  const identity = resolveIdentity(user, profile);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-base font-semibold">Impact Operations TA</span>

          <div className="flex items-center gap-3">
            <span
              data-testid="identity-display"
              className="max-w-[16rem] truncate text-sm text-muted-foreground"
              title={identity}
            >
              {identity}
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

/**
 * Resolve the label shown in the chrome for the signed-in admin: prefer the
 * profile's full name, then the profile email, then the auth user's email
 * (Requirement 4.1). Falls back to a generic label only if no identifier is
 * available at all.
 */
function resolveIdentity(user: User | null, profile: Profile | null): string {
  const fullName = profile?.full_name?.trim();
  if (fullName) return fullName;

  const profileEmail = profile?.email?.trim();
  if (profileEmail) return profileEmail;

  const userEmail = user?.email?.trim();
  if (userEmail) return userEmail;

  return "Signed in";
}

/**
 * The visible sign-out control (Requirement 4.2). Terminating the session is
 * delegated to Supabase Auth; the AuthProvider's `onAuthStateChange` listener
 * then nulls the session (and clears cached server state, Requirement 4.4),
 * which re-renders {@link ProtectedLayout} into its redirect branch and sends
 * the admin to the sign-in route.
 *
 * A dedicated `useSignOut` hook (task 7.1) may later replace the direct call;
 * the control's contract here stays the same.
 */
function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Surface the failure rather than swallowing it; re-enable the control so
      // the admin can retry.
      console.error("Sign-out failed:", error.message);
      setIsSigningOut(false);
    }
    // On success we intentionally leave the button disabled: the auth state
    // change unmounts this chrome as the layout redirects to sign-in.
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={isSigningOut}
      aria-label="Sign out"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input",
        "bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
