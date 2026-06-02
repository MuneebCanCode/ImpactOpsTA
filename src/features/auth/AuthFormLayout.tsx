import { forwardRef, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * Shared presentational shell for the sign-up and sign-in screens.
 *
 * Both auth pages are centered cards on a full-height background with the app
 * wordmark, a title/subtitle, the form, and a footer link to the other page.
 * Extracting the chrome here keeps the two pages visually consistent and lets
 * each page focus purely on its form logic. A theme toggle is included so the
 * public auth screens honor the selected theme like the rest of the app
 * (Requirement 15).
 */
type AuthFormLayoutProps = {
  /** Heading shown above the form, e.g. "Create your account". */
  title: string;
  /** Supporting line shown beneath the title. */
  subtitle: string;
  /** The form and its fields. */
  children: ReactNode;
  /** Footer content, typically a link to the sibling auth page. */
  footer: ReactNode;
};

export function AuthFormLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthFormLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold">Impact Operations TA</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * A labelled text input with inline field-level error messaging
 * (Requirements 1.4, 5.4 pattern). Designed to be spread with React Hook Form's
 * `register(...)`. When `error` is set the control is marked invalid for
 * assistive tech and the message is associated via `aria-describedby`.
 *
 * The component forwards its ref to the underlying `<input>` so that React Hook
 * Form's `register(...)` ref attaches to the real DOM node — without this the
 * library cannot read the field's value on submit.
 */
type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  /** Field-level validation message, or undefined when the field is valid. */
  error?: string;
};

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField({ id, label, error, className, ...inputProps }, ref) {
    const errorId = `${id}-error`;

    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            className,
          )}
          {...inputProps}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

/**
 * Form-level error banner for mapped auth errors (e.g. duplicate email,
 * bad credentials). Renders nothing when there is no message so callers can
 * pass the mapped error directly. Uses `role="alert"` so the message is
 * announced when it appears (Requirements 1.3, 1.10, 2.2).
 */
export function AuthErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
