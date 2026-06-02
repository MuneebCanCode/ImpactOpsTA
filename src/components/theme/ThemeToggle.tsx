import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

/**
 * A light/dark theme toggle backed by `next-themes` (Requirement 15.1).
 *
 * Toggling updates the active theme via `setTheme`, which next-themes applies
 * across every view (the `class` on <html> drives Tailwind's `dark:` variants,
 * Requirement 15.2) and persists to localStorage (Requirement 15.3).
 *
 * The component reads `resolvedTheme` so it behaves correctly even when the
 * active theme is "system": the toggle flips to the opposite of whatever is
 * currently rendered.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The resolved theme is only known on the client. Defer rendering the icon
  // until after mount to avoid showing the wrong state on first paint.
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {/* Avoid a hydration/first-paint flash: only show an icon once mounted. */}
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )
      ) : (
        <Sun className="h-4 w-4 opacity-0" aria-hidden="true" />
      )}
    </button>
  );
}
