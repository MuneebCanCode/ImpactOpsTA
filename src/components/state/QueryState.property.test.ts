// Feature: admin-org-dashboard, Property 16: State_Pattern totality

/**
 * Property 16: State_Pattern totality
 *
 * For any React Query result consumed by the shared State_Pattern component,
 * the rendered output SHALL be exactly one of:
 *   - the loading state when pending
 *   - the error state with a retry control when errored
 *   - the empty state when the data set is empty
 *   - the data view otherwise
 *
 * Validates: Requirements 8.3, 9.7, 12.1, 12.2, 12.3, 12.4, 18.3
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";
import { QueryState } from "./QueryState";
import type { UseQueryResult } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Helpers to build the four UseQueryResult shapes
// ---------------------------------------------------------------------------

type QueryShape = "pending" | "error" | "empty" | "data";

function makePendingResult(): UseQueryResult<number[], Error> {
  return {
    isPending: true,
    isError: false,
    isSuccess: false,
    isLoading: true,
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    status: "pending",
    fetchStatus: "idle",
    data: undefined,
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: false,
    isFetchedAfterMount: false,
    isInitialLoading: true,
    isStale: false,
    refetch: vi.fn(),
    promise: Promise.resolve([]),
  } as unknown as UseQueryResult<number[], Error>;
}

function makeErrorResult(): UseQueryResult<number[], Error> {
  return {
    isPending: false,
    isError: true,
    isSuccess: false,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
    isLoadingError: true,
    isRefetchError: false,
    isPlaceholderData: false,
    status: "error",
    fetchStatus: "idle",
    data: undefined,
    error: new Error("Test error"),
    dataUpdatedAt: 0,
    errorUpdatedAt: Date.now(),
    failureCount: 1,
    failureReason: new Error("Test error"),
    errorUpdateCount: 1,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isStale: false,
    refetch: vi.fn(),
    promise: Promise.resolve([]),
  } as unknown as UseQueryResult<number[], Error>;
}

function makeEmptyResult(): UseQueryResult<number[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    status: "success",
    fetchStatus: "idle",
    data: [],
    error: null,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isStale: false,
    refetch: vi.fn(),
    promise: Promise.resolve([]),
  } as unknown as UseQueryResult<number[], Error>;
}

function makeDataResult(): UseQueryResult<number[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    status: "success",
    fetchStatus: "idle",
    data: [1, 2, 3],
    error: null,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isStale: false,
    refetch: vi.fn(),
    promise: Promise.resolve([]),
  } as unknown as UseQueryResult<number[], Error>;
}

const shapeFactories: Record<QueryShape, () => UseQueryResult<number[], Error>> = {
  pending: makePendingResult,
  error: makeErrorResult,
  empty: makeEmptyResult,
  data: makeDataResult,
};

// Arbitrary that picks one of the four shapes
const queryShapeArb = fc.constantFrom<QueryShape>("pending", "error", "empty", "data");

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderQueryState(query: UseQueryResult<number[], Error>) {
  const childrenSpy = vi.fn((data: number[]) =>
    React.createElement("div", { "data-testid": "data-view" }, `items:${data.join(",")}`)
  );

  const { container } = render(
    React.createElement(QueryState<number[], Error>, {
      query,
      children: childrenSpy,
    })
  );

  return { container, childrenSpy };
}

// ---------------------------------------------------------------------------
// Property 16 tests
// ---------------------------------------------------------------------------

describe("QueryState – Property 16: State_Pattern totality", () => {
  /**
   * Property 16a: Mutual exclusivity
   * Exactly ONE of the four branches renders for any query shape.
   */
  it("16a: exactly one branch renders for any query shape (mutual exclusivity)", () => {
    fc.assert(
      fc.property(queryShapeArb, (shape) => {
        const query = shapeFactories[shape]();
        const { container } = renderQueryState(query);

        const loadingEl = container.querySelector('[data-query-state="loading"]');
        const errorEl = container.querySelector('[data-query-state="error"]');
        const emptyEl = container.querySelector('[data-query-state="empty"]');
        const dataEl = container.querySelector('[data-testid="data-view"]');

        const renderedCount = [loadingEl, errorEl, emptyEl, dataEl].filter(Boolean).length;

        // Exactly one branch must render
        expect(renderedCount).toBe(1);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16b: Correct branch for each shape
   * The correct branch renders for each of the four query shapes.
   */
  it("16b: the correct branch renders for each query shape", () => {
    fc.assert(
      fc.property(queryShapeArb, (shape) => {
        const query = shapeFactories[shape]();
        const { container } = renderQueryState(query);

        switch (shape) {
          case "pending": {
            // Req 12.1: loading state when pending
            const el = container.querySelector('[data-query-state="loading"]');
            expect(el).not.toBeNull();
            break;
          }
          case "error": {
            // Req 12.3: error state with retry control when errored
            const el = container.querySelector('[data-query-state="error"]');
            expect(el).not.toBeNull();
            // Retry button must be present
            const retryBtn = container.querySelector('button');
            expect(retryBtn).not.toBeNull();
            break;
          }
          case "empty": {
            // Req 12.2: empty state when data set is empty
            const el = container.querySelector('[data-query-state="empty"]');
            expect(el).not.toBeNull();
            break;
          }
          case "data": {
            // data view when data is non-empty
            const el = container.querySelector('[data-testid="data-view"]');
            expect(el).not.toBeNull();
            break;
          }
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16c: Children callback only called with non-empty data
   * The data children render prop is only invoked when the query has non-empty data.
   */
  it("16c: children callback is only called with non-empty data", () => {
    fc.assert(
      fc.property(queryShapeArb, (shape) => {
        const query = shapeFactories[shape]();
        const { childrenSpy } = renderQueryState(query);

        if (shape === "data") {
          // Children must be called with the non-empty data array
          expect(childrenSpy).toHaveBeenCalledTimes(1);
          const [calledWith] = childrenSpy.mock.calls[0];
          expect(Array.isArray(calledWith)).toBe(true);
          expect((calledWith as number[]).length).toBeGreaterThan(0);
        } else {
          // Children must NOT be called for pending, error, or empty shapes
          expect(childrenSpy).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16d: Loading state has correct ARIA attributes (Req 12.1)
   */
  it("16d: loading branch has role=status and aria-busy=true", () => {
    fc.assert(
      fc.property(fc.constant("pending" as QueryShape), (shape) => {
        const query = shapeFactories[shape]();
        const { container } = renderQueryState(query);

        const el = container.querySelector('[data-query-state="loading"]');
        expect(el).not.toBeNull();
        expect(el?.getAttribute("role")).toBe("status");
        expect(el?.getAttribute("aria-busy")).toBe("true");
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16e: Error state has role=alert (Req 12.3)
   */
  it("16e: error branch has role=alert", () => {
    fc.assert(
      fc.property(fc.constant("error" as QueryShape), (shape) => {
        const query = shapeFactories[shape]();
        const { container } = renderQueryState(query);

        const el = container.querySelector('[data-query-state="error"]');
        expect(el).not.toBeNull();
        expect(el?.getAttribute("role")).toBe("alert");
      }),
      { numRuns: 10 }
    );
  });
});

