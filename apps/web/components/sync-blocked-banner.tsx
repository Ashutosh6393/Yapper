"use client";

import { AlertTriangle } from "lucide-react";
import { useSyncStore } from "../lib/stores/sync";

/**
 * Shown app-wide once a push comes back `blocked` (spec 26c, ADR-005) — the server has permanently
 * refused this client's writes (a `403` on a client group bound to another user is the case that
 * motivated this).
 *
 * The failure it announces was, before this, completely invisible: the pusher retried forever, the
 * optimistic replay kept painting the user's unsent mutations back at them, and the app looked healthy
 * while nothing had saved for hours. A permanent stop must say so. Reloading re-mints the client group
 * (26a/26b), which is why that is the advice.
 */
export function SyncBlockedBanner() {
  const blocked = useSyncStore((s) => s.blocked);
  if (blocked === null) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-destructive/30 border-b bg-destructive/10 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="text-foreground">
        Your changes aren't saving — the server rejected this device.{" "}
        <span className="text-muted-foreground">
          They're safe here; reload to reconnect this device.
        </span>
      </span>
    </div>
  );
}
