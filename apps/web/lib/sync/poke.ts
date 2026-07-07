"use client";

import { useEffect } from "react";
import { API_URL } from "../http";
import { isSyncEngineEnabled } from "./flag";
import { pull } from "./pull";

/**
 * The client poke transport (spec 17, ADR-0005). Mounted once behind the flag near the engine root, it
 * opens **one** `EventSource('/api/sync/stream')` per tab and, on each dataless `poke`, runs the puller
 * (spec 16) — **coalesced** so a burst collapses to a single `pull()`. Three always-on **backstops**
 * (window `focus`, `document` `visibilitychange` → visible, and `online`) schedule the same coalesced
 * pull independently of the EventSource, covering any missed poke or reconnect gap. Pokes are
 * best-effort: EventSource auto-reconnects on its own and the CVR pull is authoritative, so a dropped
 * poke only delays a pull, never corrupts state. Everything is torn down on unmount / flag-flip.
 */

/** Trailing-debounce window: one pull per burst of pokes/backstops (ADR-17b). */
const COALESCE_MS = 300;

export function useSyncPoke(): void {
  useEffect(() => {
    if (!isSyncEngineEnabled()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedulePull = () => {
      if (timer) return; // leading-guard: a pull is already scheduled — coalesce into it
      timer = setTimeout(() => {
        timer = null;
        void pull();
      }, COALESCE_MS);
    };

    const es = new EventSource(`${API_URL}/api/sync/stream`, { withCredentials: true });
    es.addEventListener("poke", schedulePull); // payload unused — the poke is a pure trigger

    // Backstops: independent of the stream, so they fire even while EventSource is reconnecting.
    const onVisible = () => {
      if (document.visibilityState === "visible") schedulePull();
    };
    window.addEventListener("focus", schedulePull);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedulePull);

    return () => {
      if (timer) clearTimeout(timer);
      es.removeEventListener("poke", schedulePull);
      es.close();
      window.removeEventListener("focus", schedulePull);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", schedulePull);
    };
  }, []);
}
