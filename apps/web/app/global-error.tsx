"use client";

import { useEffect } from "react";
import { reportError } from "../lib/report-error";
import "./globals.css";

/**
 * Last resort (spec 25c). Reached only when the root layout itself throws, so it replaces the layout and
 * every provider — which is exactly why the button **reloads** rather than calling `reset()`. By the time
 * this renders there is no QueryClient, no sync engine and no theme provider left; `reset()` would be
 * re-rendering a corpse.
 *
 * It ships its own `<html>`/`<body>` for the same reason: there is no layout above it. No theme provider
 * either, so the styling stays deliberately token-only and works in both schemes.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl tracking-tight">Something went wrong</h1>
            <p className="max-w-md text-muted-foreground text-sm">
              Yapper hit an unexpected error. Your notes are saved on this device — reloading is
              safe.
            </p>
          </div>
          {/* Not a shadcn <Button>: this tree renders without the providers, so it stays dependency-free
              and styled from tokens alone. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:opacity-90"
          >
            Reload Yapper
          </button>
        </main>
      </body>
    </html>
  );
}
