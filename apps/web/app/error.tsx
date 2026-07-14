"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isChunkError } from "../lib/is-chunk-error";
import { reportError } from "../lib/report-error";

/**
 * Route-level boundary (spec 25c). The root layout and providers survive here, so `reset()` is a fair bet
 * for a transient render throw — but **not** for a stale-deploy chunk (ADR-007): `reset()` re-renders the
 * same subtree, re-requests the same dead chunk URL, and fails identically. A button that cannot work is
 * worse than no button.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isChunkError(error);

  useEffect(() => {
    reportError(error, { boundary: "route", digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">
          {stale ? "Yapper was updated" : "Something went wrong"}
        </h1>
        <p className="max-w-md text-muted-foreground text-sm">
          {stale
            ? "A new version is available. Reload to pick it up — your notes are saved on this device."
            : "That page failed to load. Your notes are saved on this device."}
        </p>
      </div>
      <Button onClick={stale ? () => window.location.reload() : reset}>
        {stale ? "Reload" : "Try again"}
      </Button>
    </main>
  );
}
