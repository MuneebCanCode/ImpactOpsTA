import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";

/**
 * Admin profile row shape (the `profiles` table: id, email, full_name,
 * is_admin, created_at).
 *
 * Defined locally here rather than imported from generated database types so
 * the AuthProvider has no dependency on the (separately-tracked) type
 * generation task. Once `src/types/database.ts` exists this can be aliased to
 * `Database['public']['Tables']['profiles']['Row']`.
 */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
};

/**
 * The authentication context contract consumed via {@link useAuth}.
 *
 * - `session`   - the current Supabase session, or null when signed out.
 * - `user`      - convenience accessor for `session.user`, or null.
 * - `profile`   - the signed-in admin's `profiles` row, or null while it is
 *                 loading / when signed out / if it could not be read.
 * - `isLoading` - true until the initial session has been resolved from
 *                 `getSession()`. Consumers (e.g. ProtectedLayout) gate on this
 *                 to avoid a redirect flicker before auth state is known.
 */
export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Columns selected for the profile row; mirrors the {@link Profile} shape. */
const PROFILE_COLUMNS = "id, email, full_name, is_admin, created_at";

/**
 * Read the admin profile row for a user. Returns null (rather than throwing) on
 * error or absence so the app can still render with a valid session while the
 * profile is unavailable. The failure is logged for diagnosis.
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("AuthProvider: failed to load profile:", error.message);
    return null;
  }

  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * The user id whose profile is currently loaded or in-flight. Used to dedupe
   * redundant profile fetches (e.g. on TOKEN_REFRESHED, which fires with the
   * same user) and to ignore stale async results after a fast user switch.
   */
  const loadedProfileUserIdRef = useRef<string | null>(null);
  /**
   * Whether a session was present on the previous auth update. Lets us detect a
   * transition from "had a session" to "no session" (session loss) so we clear
   * the cache without clearing it on the very first, never-signed-in load.
   */
  const hadSessionRef = useRef(false);

  useEffect(() => {
    // Guards against state updates after unmount and against stale async
    // resolutions (notably under React StrictMode's mount/unmount/mount cycle).
    let active = true;

    const syncProfile = async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;

      if (!nextUser) {
        loadedProfileUserIdRef.current = null;
        if (active) setProfile(null);
        return;
      }

      // Same user already loaded/loading - keep the existing profile.
      if (loadedProfileUserIdRef.current === nextUser.id) return;

      loadedProfileUserIdRef.current = nextUser.id;
      const loaded = await fetchProfile(nextUser.id);

      // Only apply if still mounted and the user hasn't changed meanwhile.
      if (active && loadedProfileUserIdRef.current === nextUser.id) {
        setProfile(loaded);
      }
    };

    // 1. Initialize from the persisted session.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      hadSessionRef.current = data.session !== null;
      void syncProfile(data.session);
      setIsLoading(false);
    });

    // 2. React to subsequent auth changes (sign-in, sign-out, token refresh,
    //    session expiry). The listener also fires once on subscribe with the
    //    INITIAL_SESSION event.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      setSession(nextSession);
      void syncProfile(nextSession);

      // Clear cached server state on sign-out or session loss (Requirements
      // 4.4 and 3.4). Supabase emits SIGNED_OUT both on an explicit sign-out
      // and when a session expires/is invalidated and cannot be refreshed. The
      // transition check is a defensive backstop for any path where the session
      // drops to null without a SIGNED_OUT event; it never fires on the initial
      // never-signed-in load because `hadSessionRef` starts false.
      const sessionLost = hadSessionRef.current && nextSession === null;
      if (event === "SIGNED_OUT" || sessionLost) {
        queryClient.clear();
      }

      hadSessionRef.current = nextSession !== null;

      // The initial session is now known; stop blocking dependent UI even if
      // getSession()'s promise has not resolved yet.
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
    }),
    [session, profile, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the authentication context. Must be called from within an
 * {@link AuthProvider}; throws otherwise so misuse fails loudly at development
 * time rather than silently returning undefined.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
