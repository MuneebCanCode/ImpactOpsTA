import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client.
 *
 * All server state in the app flows through this single client (no
 * effect-based fetching). Defaults are tuned for an authenticated dashboard:
 * - `staleTime` avoids refetch storms while keeping data reasonably fresh.
 * - Retries are limited so genuine errors surface promptly to the shared
 *   State_Pattern's error view instead of being masked by long retry loops.
 * - Cache invalidation (e.g. on org creation / member invitation) is the single
 *   mechanism that keeps the directory and member lists in sync.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
