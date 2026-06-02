import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import type { AuthContextValue } from "@/providers/AuthProvider";
import type { Session, User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// supabase.ts throws at import time when env vars are absent; stub it out.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// Stub queryClient — use vi.hoisted so the variable is available when the
// factory is hoisted to the top of the file by Vitest's transform.
const { mockQueryClientClear } = vi.hoisted(() => ({
  mockQueryClientClear: vi.fn(),
}));
vi.mock("@/lib/queryClient", () => ({
  queryClient: { clear: mockQueryClientClear },
}));

// Stub ThemeToggle — it has its own provider dependency we don't need here.
vi.mock("@/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

// useAuth is the single seam we control per test.
const mockUseAuth = vi.fn<() => AuthContextValue>();
vi.mock("@/providers/AuthProvider", async () => {
  const actual =
    await vi.importActual<typeof import("@/providers/AuthProvider")>(
      "@/providers/AuthProvider",
    );
  return { ...actual, useAuth: () => mockUseAuth() };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fake Session — only the fields ProtectedLayout cares about. */
function makeSession(email = "admin@example.com"): Session {
  return {
    user: { id: "user-1", email } as User,
    access_token: "tok",
    refresh_token: "ref",
    expires_in: 3600,
    token_type: "bearer",
  } as Session;
}

/**
 * Render ProtectedLayout inside a MemoryRouter so React Router hooks work.
 * The `/sign-in` route renders a sentinel so we can assert on redirects.
 * The protected outlet renders a sentinel so we can assert on content access.
 */
function renderProtectedLayout(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedLayout />}>
          <Route
            path="/dashboard"
            element={<div data-testid="protected-content">Protected</div>}
          />
        </Route>
        <Route
          path="/sign-in"
          element={<div data-testid="sign-in-page">Sign In</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProtectedLayout — route protection", () => {
  it("redirects to /sign-in when there is no session (Req 3.1)", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    // The sentinel for the sign-in route should be visible.
    expect(screen.getByTestId("sign-in-page")).toBeInTheDocument();
    // Protected content must NOT be rendered.
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("does NOT render protected content when there is no session (Req 3.2)", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders protected content (Outlet) when a session exists (Req 3.3)", () => {
    const session = makeSession();
    mockUseAuth.mockReturnValue({
      session,
      user: session.user,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    // Must NOT have redirected to sign-in.
    expect(screen.queryByTestId("sign-in-page")).not.toBeInTheDocument();
  });

  it("shows a loading state — no redirect and no content — while isLoading is true (Req 3.4)", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: true,
    });

    renderProtectedLayout();

    // The loading spinner should be present.
    expect(screen.getByTestId("protected-layout-loading")).toBeInTheDocument();
    // Neither the protected content nor the sign-in redirect should appear.
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sign-in-page")).not.toBeInTheDocument();
  });

  it("redirects to /sign-in after session expiry (session becomes null) (Req 3.4)", () => {
    // Simulate the state after AuthProvider has nulled the session on expiry.
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.getByTestId("sign-in-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });
});

describe("ProtectedLayout — identity display (Req 4.1)", () => {
  it("displays the user's email in the identity display when no profile is loaded", () => {
    const session = makeSession("admin@example.com");
    mockUseAuth.mockReturnValue({
      session,
      user: session.user,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.getByTestId("identity-display")).toHaveTextContent(
      "admin@example.com",
    );
  });

  it("prefers the profile full_name over email in the identity display", () => {
    const session = makeSession("admin@example.com");
    mockUseAuth.mockReturnValue({
      session,
      user: session.user,
      profile: {
        id: "user-1",
        email: "admin@example.com",
        full_name: "Alice Admin",
        is_admin: true,
        created_at: "2024-01-01T00:00:00Z",
      },
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.getByTestId("identity-display")).toHaveTextContent(
      "Alice Admin",
    );
  });

  it("falls back to profile email when full_name is absent", () => {
    const session = makeSession("auth@example.com");
    mockUseAuth.mockReturnValue({
      session,
      user: session.user,
      profile: {
        id: "user-1",
        email: "profile@example.com",
        full_name: null,
        is_admin: true,
        created_at: "2024-01-01T00:00:00Z",
      },
      isLoading: false,
    });

    renderProtectedLayout();

    expect(screen.getByTestId("identity-display")).toHaveTextContent(
      "profile@example.com",
    );
  });
});

describe("ProtectedLayout — sign-out control (Req 4.2)", () => {
  it("renders a sign-out button when a session exists", () => {
    const session = makeSession();
    mockUseAuth.mockReturnValue({
      session,
      user: session.user,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render the sign-out button when there is no session", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
    });

    renderProtectedLayout();

    expect(
      screen.queryByRole("button", { name: /sign out/i }),
    ).not.toBeInTheDocument();
  });
});
