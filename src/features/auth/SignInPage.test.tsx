import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SignInPage } from "@/features/auth/SignInPage";
import {
  INVALID_CREDENTIALS_MESSAGE,
  GENERIC_SIGN_IN_ERROR_MESSAGE,
} from "@/features/auth/authErrors";

/**
 * Unit tests for SignInPage UI states.
 *
 * We mock useSignIn so tests are deterministic and never touch Supabase or the
 * router. Each test drives a specific mutation state (isPending / error) and
 * asserts the expected UI output.
 *
 * _Requirements: 2.2, 2.4_
 */

// Supabase client throws at import time when env vars are absent.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// useNavigate is called inside useSignIn's onSuccess; stub it so the module
// loads cleanly even though we never trigger navigation in these tests.
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

type MockMutation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error: Error | null;
};

const mockMutation: MockMutation = {
  mutate: vi.fn(),
  isPending: false,
  error: null,
};

vi.mock("@/features/auth/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/hooks")>(
    "@/features/auth/hooks",
  );
  return {
    ...actual,
    useSignIn: () => mockMutation,
  };
});

beforeEach(() => {
  mockMutation.mutate = vi.fn();
  mockMutation.isPending = false;
  mockMutation.error = null;
});

describe("SignInPage", () => {
  it("shows a loading spinner and disables the submit button while isPending (Req 2.4)", () => {
    mockMutation.isPending = true;
    render(<SignInPage />);

    // The button text changes to "Signing in…" and aria-busy is set
    const submit = screen.getByRole("button", { name: /signing in/i });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");

    // The Loader2 spinner SVG is rendered inside the button (aria-hidden)
    // We verify the button contains a child with aria-hidden="true"
    const spinner = submit.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
  });

  it("shows INVALID_CREDENTIALS_MESSAGE banner on bad-credential error (Req 2.2)", () => {
    // Simulate a Supabase AuthError with the invalid_credentials code
    const authError = Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials",
      status: 400,
      name: "AuthApiError",
      __isAuthError: true,
    });
    mockMutation.error = authError;

    render(<SignInPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(INVALID_CREDENTIALS_MESSAGE);
  });

  it("shows a generic error banner for non-credential errors", () => {
    mockMutation.error = new Error("Network request failed");

    render(<SignInPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Network request failed");
  });

  it("shows the generic fallback message when error has no message", () => {
    const emptyError = new Error("");
    mockMutation.error = emptyError;

    render(<SignInPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(GENERIC_SIGN_IN_ERROR_MESSAGE);
  });
});
