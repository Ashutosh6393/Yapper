"use client";

import { useEffect, useState } from "react";
import { useSession } from "./auth-client";

type SessionData = ReturnType<typeof useSession>["data"];

const CACHE_KEY = "yapper.session";

function readCache(): SessionData {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

/** The signed-in user id, readable outside React — the sync engine (push/pull/bootstrap) needs it to
 * scope the `clientGroupID` to its user (spec 26b) and has no hook to read it from. */
export function currentUserId(): string | null {
  return readCache()?.user.id ?? null;
}

/** Drop the mirrored session (call on explicit sign-out so a shared browser can't optimistically
 * re-render the previous user's shell). */
export function clearPersistedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore storage failures — the live session stays authoritative
  }
}

/**
 * `useSession` with a localStorage mirror so a reload renders instantly from the last-known session
 * instead of a full-screen loading flash, while Better Auth revalidates in the background (the
 * cross-origin cookie stays authoritative — this is only a client render hint). The mirror is read
 * *after* mount (never in the initializer) so the first client render still matches the server's
 * loading HTML — no hydration mismatch — then flips in on the next tick. On a confirmed sign-out
 * (`live` resolves to `null`) it clears itself.
 *
 * `isPending` is true only when there is nothing to show yet — no cache **and** the live fetch is
 * still in flight — so a returning user never sees the spinner.
 */
export function usePersistedSession() {
  const live = useSession();
  const [cached, setCached] = useState<SessionData>(null);

  useEffect(() => {
    setCached(readCache());
  }, []);

  // Mirror the authoritative session to storage; clear it on a confirmed sign-out. We deliberately do
  // NOT push `live.data` into `cached` — `data` below already prefers it — so an unstable session
  // reference (e.g. a hook that returns a fresh object each render) can't loop this into a setState storm.
  //
  // A *failed* fetch (offline, 5xx) settles the same way a sign-out does — no data, not pending — but
  // leaves `error` set, while an unauthenticated *response* resolves with `data: null, error: null`.
  // Only the latter is a sign-out; clearing on the former means going offline logs the user out.
  useEffect(() => {
    if (live.data) {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(live.data));
      } catch {
        // ignore
      }
    } else if (!live.isPending && !live.error) {
      clearPersistedSession();
      setCached(null);
    }
  }, [live.data, live.isPending, live.error]);

  const data = live.data ?? cached;
  return { ...live, data, isPending: live.isPending && data == null };
}
