import { isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
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
