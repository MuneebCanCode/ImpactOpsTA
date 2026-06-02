import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";

/**
 * Wraps the application with `next-themes`, driving Tailwind's `dark:` variants
 * via the `class` attribute on the <html> element (Requirement 15.2).
 *
 * Theme selection is persisted to localStorage by next-themes under
 * `storageKey`, so the chosen theme survives reloads and new sessions
 * (Requirement 15.3).
 *
 * Defaults can be overridden by the caller, but the `attribute="class"`
 * contract is fixed because the Tailwind config uses `darkMode: ["class"]`.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="admin-org-dashboard-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
