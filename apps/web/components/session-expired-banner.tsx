"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "../lib/stores/auth";

/**
 * Shown app-wide once the API answers `401` (spec 25b, ADR-003). The user's queued edits are safe in
 * Dexie, but nothing can reach the server until they re-authenticate — and the pusher has paused, so
 * without this banner the app would go on looking healthy while saving nothing.
 *
 * Not a toast: a toast is dismissible and ephemeral, and a user who misses it goes back to typing into a
 * void. Not a redirect either — bouncing to `/login` mid-edit would be a surprise. The banner persists,
 * and sign-in is a choice.
 *
 * Sign-in is the existing `/login` flow (`?returnTo` brings them back). Its OAuth round-trip is a full
 * page load, which resets this in-memory flag and re-runs `SyncEngineBootstrap` — whose `schedulePush()`
 * drains the queue. That is the whole "resume" path; it needs no code of its own.
 */
export function SessionExpiredBanner() {
  const expired = useAuthStore((s) => s.expired);
  const pathname = usePathname();
  if (!expired) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-destructive/30 border-b bg-destructive/10 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="text-foreground">
        Your session expired — sign in to keep saving.{" "}
        <span className="text-muted-foreground">Your changes are safe on this device.</span>
      </span>
      <Button asChild size="sm" variant="destructive">
        <Link href={`/login?returnTo=${encodeURIComponent(pathname)}`}>Sign in</Link>
      </Button>
    </div>
  );
}
