import { isServer, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";
import { reportError } from "./report-error";
import { useAuthStore } from "./stores/auth";

/**
 * Every read and every mutation in the app fails through here (spec 25a, ADR-004) — including ones not
 * yet written. That is why the `401` check lives at the cache, not inside `apiFetch`: `http.ts` stays a
 * dumb fetch wrapper that throws `ApiError`, instead of being coupled to auth state to hand-roll an
 * interceptor TanStack already ships.
 *
 * A `401` is a dead session, not a defect — flag it (the banner prompts re-auth, the pusher pauses) and
 * do **not** report it. Everything else goes to the funnel, which does its own filtering (ADR-005).
 */
function handleError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) {
    useAuthStore.getState().markExpired();
    return;
  }
  reportError(err);
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      // staleTime > 0 avoids an immediate refetch on the client after any
      // server-rendered/hydrated state; tune per-query as needed in 09c.
      queries: { staleTime: 60 * 1000 },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * One QueryClient per request on the server, a singleton in the browser (so a
 * suspended initial render doesn't throw the client away). See TanStack's
 * Next.js App Router guidance.
 */
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
