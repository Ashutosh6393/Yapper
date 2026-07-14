"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";
import { SessionExpiredBanner } from "@/components/session-expired-banner";
import { Toaster } from "@/components/ui/sonner";
import { warmPrecache } from "../lib/precache";
import { getQueryClient } from "../lib/query-client";
import { reportError } from "../lib/report-error";
import { SyncEngineProvider } from "../lib/sync/provider";

/**
 * Register the service worker that serves the app shell offline, then warm its cache with the build's
 * full asset list (spec 24b). Production only — a SW in `next dev` serves stale chunks and fights HMR.
 *
 * The warm-up matters as much as the registration: the SW caches assets on demand, so without it the
 * code-split editor chunks are cached only if the user happened to open a note while online — and going
 * offline without them is a ChunkLoadError, not an app. Both steps are non-fatal on failure.
 */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => warmPrecache())
      .catch(() => {});
  }, []);
}

/**
 * The catch-all seam (spec 25a): async errors that reach neither the Query cache nor a boundary — a
 * rejected promise in an event handler, the Hocuspocus provider's own socket failures. Error boundaries
 * do not see any of these (they catch render throws only), so without this they vanish entirely.
 */
function useUnhandledRejections() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
}

/** App-wide client providers: theme (light/dark via next-themes) + TanStack Query + toasts. */
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  useServiceWorker();
  useUnhandledRejections();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {/* Above everything: an expired session pauses the pusher, so any page below this could be
            silently failing to save until the user re-authenticates (spec 25b). */}
        <SessionExpiredBanner />
        <SyncEngineProvider>{children}</SyncEngineProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
