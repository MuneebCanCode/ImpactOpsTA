import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ThemeProvider } from "@/providers/ThemeProvider";

// ---------------------------------------------------------------------------
// Mock next-themes so tests run without a real DOM theme context.
// We expose a mutable `mockTheme` object that individual tests can override.
// ---------------------------------------------------------------------------

const mockTheme = {
  resolvedTheme: "light" as string | undefined,
  setTheme: vi.fn(),
};

vi.mock("next-themes", async () => {
  const actual = await vi.importActual<typeof import("next-themes")>("next-themes");
  return {
    ...actual,
    // ThemeToggle calls useTheme(); return our controllable mock.
    useTheme: () => mockTheme,
    // ThemeProvider wraps NextThemesProvider; keep it as a simple pass-through
    // so we can inspect the props passed to it.
    ThemeProvider: ({ children, ...props }: Record<string, unknown>) => {
      // Expose props on a data attribute for assertion convenience.
      return (
        <div
          data-testid="next-themes-provider"
          data-attribute={props.attribute as string}
          data-storage-key={props.storageKey as string}
        >
          {children as React.ReactNode}
        </div>
      );
    },
  };
});

beforeEach(() => {
  mockTheme.resolvedTheme = "light";
  mockTheme.setTheme = vi.fn();
});

// ---------------------------------------------------------------------------
// ThemeToggle — Requirement 15.1
// ---------------------------------------------------------------------------

describe("ThemeToggle", () => {
  it("renders a button with aria-label 'Switch to dark theme' when the current theme is light (Req 15.1)", () => {
    mockTheme.resolvedTheme = "light";
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /switch to dark theme/i }),
    ).toBeInTheDocument();
  });

  it("renders a button with aria-label 'Switch to light theme' when the current theme is dark (Req 15.1)", () => {
    mockTheme.resolvedTheme = "dark";
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it("calls setTheme('dark') when the current theme is light and the button is clicked (Req 15.1)", async () => {
    mockTheme.resolvedTheme = "light";
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(mockTheme.setTheme).toHaveBeenCalledTimes(1);
    expect(mockTheme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('light') when the current theme is dark and the button is clicked (Req 15.1)", async () => {
    mockTheme.resolvedTheme = "dark";
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /switch to light theme/i }));

    expect(mockTheme.setTheme).toHaveBeenCalledTimes(1);
    expect(mockTheme.setTheme).toHaveBeenCalledWith("light");
  });
});

// ---------------------------------------------------------------------------
// ThemeProvider — Requirements 15.2 & 15.3
// ---------------------------------------------------------------------------

describe("ThemeProvider", () => {
  it("renders its children (Req 15.2)", () => {
    render(
      <ThemeProvider>
        <span data-testid="child">hello</span>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("passes attribute='class' to NextThemesProvider so Tailwind dark: variants work (Req 15.2)", () => {
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("next-themes-provider")).toHaveAttribute(
      "data-attribute",
      "class",
    );
  });

  it("passes the correct storageKey for theme persistence across reloads (Req 15.3)", () => {
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("next-themes-provider")).toHaveAttribute(
      "data-storage-key",
      "admin-org-dashboard-theme",
    );
  });
});
