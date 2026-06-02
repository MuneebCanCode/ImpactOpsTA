import { type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The shared State_Pattern component (Requirement 12).
 *
 * `QueryState` consumes a TanStack React Query result and renders EXACTLY ONE
 * of four mutually-exclusive states:
 *
 *   - loading      while the request is pending          (Req 12.1)
 *   - error+retry  when the request has failed           (Req 12.3)
 *   - empty        when the request succeeded with no data (Req 12.2)
 *   - data         when the request succeeded with data
 *
 * Mutual exclusivity is a correctness property (design Property 16): React
 * Query's `status` is always exactly one of `pending | error | success`, so
 * branching on it guarantees one and only one branch renders. The component is
 * used identically across the Directory, the Org_Detail_View, and the members
 * list (Requirement 12.4).
 */
export type QueryStateProps<TData, TError = Error> = {
  /** The React Query result to derive the view state from. */
  query: UseQueryResult<TData, TError>;
  /** Renders the data view. Only invoked on a non-empty successful result. */
  children: (data: TData) => ReactNode;
  /**
   * Predicate deciding whether a successful result is "empty". Defaults to
   * treating `null`/`undefined` and empty arrays as empty so collection views
   * work without extra wiring.
   */
  isEmpty?: (data: TData) => boolean;
  /** Custom loading view. Falls back to a default spinner. */
  loading?: ReactNode;
  /** Custom empty view. Falls back to a default empty state. */
  empty?: ReactNode;
  /**
   * Custom error view. Receives the error and a `retry` callback that re-runs
   * the query. Falls back to a default error state with a retry control.
   */
  error?: (error: TError, retry: () => void) => ReactNode;
  /** Optional class applied to the default loading/error/empty containers. */
  className?: string;
};

/**
 * Default emptiness check: nullish values and empty arrays are empty; any other
 * successful value is considered present.
 */
function defaultIsEmpty<TData>(data: TData): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function QueryState<TData, TError = Error>({
  query,
  children,
  isEmpty = defaultIsEmpty,
  loading,
  empty,
  error,
  className,
}: QueryStateProps<TData, TError>): ReactNode {
  // 1. Pending -> loading state (Req 12.1)
  if (query.isPending) {
    return loading !== undefined ? loading : <DefaultLoading className={className} />;
  }

  // 2. Error -> error state with a retry control (Req 12.3)
  if (query.isError) {
    const retry = () => {
      void query.refetch();
    };
    return error !== undefined ? (
      error(query.error, retry)
    ) : (
      <DefaultError error={query.error} onRetry={retry} className={className} />
    );
  }

  // 3. Success: distinguish empty from data.
  const data = query.data;

  // 3a. Empty -> empty state (Req 12.2)
  if (isEmpty(data)) {
    return empty !== undefined ? empty : <DefaultEmpty className={className} />;
  }

  // 3b. Otherwise -> data view.
  return children(data);
}

function DefaultLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-query-state="loading"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function DefaultError<TError>({
  error,
  onRetry,
  className,
}: {
  error: TError;
  onRetry: () => void;
  className?: string;
}) {
  const message = errorMessage(error);
  return (
    <div
      role="alert"
      data-query-state="error"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className,
      )}
    >
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-md border border-input",
          "bg-background px-4 text-sm font-medium shadow-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        Retry
      </button>
    </div>
  );
}

function DefaultEmpty({ className }: { className?: string }) {
  return (
    <div
      data-query-state="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground",
        className,
      )}
    >
      <Inbox className="h-6 w-6" aria-hidden="true" />
      <p className="text-sm">No items to display.</p>
    </div>
  );
}

/** Extract a human-readable message from an unknown error value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "Something went wrong. Please try again.";
}
