import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SignUpPage } from "@/features/auth/SignUpPage";
import {
  DUPLICATE_EMAIL_MESSAGE,
} from "@/features/auth/authErrors";
import { AuthSetupError, SIGN_UP_SETUP_FAILURE_MESSAGE } from "@/features/auth/hooks";

/**
 * Unit tests for SignUpPage UI states.
 *
 * We mock useSignUp so tests are deterministic and never touch Supabase or the
 * router. Each test drives a specific mutation state (isPending / error) and
 * asserts the expected UI output.
 *
 * _Requirements: 1.3, 1.6_
 */

// Supabase client throws at import time when env vars are absent.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// useNavigate is called inside useSignUp's onSuccess; stub it so the module
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
    useSignUp: () => mockMutation,
  };
});

beforeEach(() => {
  mockMutation.mutate = vi.fn();
  mockMutation.isPending = false;
  mockMutation.error = null;
});

describe("SignUpPage", () => {
  it("shows DUPLICATE_EMAIL_MESSAGE banner on duplicate-email error (Req 1.3)", () => {
    // Simulate a Supabase AuthError with the email_exists code
    const authError = Object.assign(new Error("User already registered"), {
      code: "email_exists",
      status: 422,
      name: "AuthApiError",
      __isAuthError: true,
    });
    mockMutation.error = authError;

    render(<SignUpPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(DUPLICATE_EMAIL_MESSAGE);
  });

  it("shows setup-failure message on AuthSetupError (Req 1.6)", () => {
    mockMutation.error = new AuthSetupError();

    render(<SignUpPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(SIGN_UP_SETUP_FAILURE_MESSAGE);
  });

  it("shows a loading spinner and disables the submit button while isPending", () => {
    mockMutation.isPending = true;
    render(<SignUpPage />);

    const submit = screen.getByRole("button", { name: /creating account/i });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");

    const spinner = submit.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
  });

  it("shows a generic error banner for other errors", () => {
    mockMutation.error = new Error("Something went wrong");

    render(<SignUpPage />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Something went wrong");
  });
});
