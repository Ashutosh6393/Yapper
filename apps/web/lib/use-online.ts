"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Live connectivity, over the same two events the sync engine's backoff already binds
 * (`lib/sync/backoff.ts`). The server snapshot is `true` — SSR renders the online markup, so an online
 * client hydrates without a mismatch and an offline one flips on the first tick.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
