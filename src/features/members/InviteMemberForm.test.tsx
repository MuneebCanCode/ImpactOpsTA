import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InviteMemberForm } from "@/features/members/InviteMemberForm";
import { InviteMemberError } from "@/features/members/hooks";

/**
 * The form's job is wiring, not networking: it validates the email with the
 * invite Zod schema before submit, hands valid input to the mutation, resets on
 * success, surfaces the (already-mapped) server error message, and reflects the
 * pending state. We mock {@link useInviteMember} so these behaviors are tested
 * deterministically without touching Supabase.
 */

// The real hooks module imports the Supabase client, which throws at import
// time when env vars are absent (as in the test runner). Stub the client so the
// module graph loads; the mutation itself is mocked below.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

type MockMutation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error: InviteMemberError | null;
};

const mockMutation: MockMutation = {
  mutate: vi.fn(),
  isPending: false,
  error: null,
};

vi.mock("@/features/members/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/features/members/hooks")>(
    "@/features/members/hooks",
  );
  return {
    ...actual,
    useInviteMember: () => mockMutation,
  };
});

beforeEach(() => {
  mockMutation.mutate = vi.fn();
  mockMutation.isPending = false;
  mockMutation.error = null;
});

describe("InviteMemberForm", () => {
  it("blocks submission and shows a field error for an invalid email (Req 7.2)", async () => {
    const user = userEvent.setup();
    render(<InviteMemberForm orgId="org-1" />);

    await user.type(screen.getByLabelText(/invite by email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(mockMutation.mutate).not.toHaveBeenCalled();
  });

  it("submits a valid email to the invite mutation (Req 7.2)", async () => {
    const user = userEvent.setup();
    render(<InviteMemberForm orgId="org-1" />);

    await user.type(
      screen.getByLabelText(/invite by email/i),
      "teammate@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(mockMutation.mutate).toHaveBeenCalledTimes(1);
    });
    expect(mockMutation.mutate.mock.calls[0][0]).toEqual({
      email: "teammate@example.com",
    });
  });

  it("resets the email field after a successful invite (Req 7.6)", async () => {
    // Drive the onSuccess callback the component passes to mutate.
    mockMutation.mutate = vi.fn((_input, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const user = userEvent.setup();
    render(<InviteMemberForm orgId="org-1" />);

    const field = screen.getByLabelText(/invite by email/i) as HTMLInputElement;
    await user.type(field, "teammate@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(field.value).toBe(""));
  });

  it.each([
    [403, "You do not have permission to invite members to this organization."],
    [409, "That email has already been invited to this organization."],
    [400, "Enter a valid email address."],
  ])(
    "surfaces the mapped %s error message in the banner",
    async (status, message) => {
      mockMutation.error = new InviteMemberError(message, status);
      render(<InviteMemberForm orgId="org-1" />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(message);
    },
  );

  it("disables the submit control and shows a spinner while pending", () => {
    mockMutation.isPending = true;
    render(<InviteMemberForm orgId="org-1" />);

    const submit = screen.getByRole("button", { name: /sending invite/i });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });
});
