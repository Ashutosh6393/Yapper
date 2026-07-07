"use client";

import { type ReactNode, useEffect } from "react";
import { getClientGroupID, rebuild } from "./db";
import { isSyncEngineEnabled } from "./flag";
import { pull } from "./pull";

/**
 * The flag-gated mount point for the local-first sync engine (spec 14, ADR-004). When the flag is off
 * it is a transparent pass-through that touches nothing — the app is byte-for-byte today's behavior.
 * When on it opens the Dexie store and resolves `clientGroupID` on mount, then renders children.
 *
 * Spec 14 wires no pusher/puller/poke here — siblings (16/17/19) attach their engine hooks to this one
 * seam so `providers.tsx` is edited once.
 */
export function SyncEngineProvider({ children }: { children: ReactNode }) {
  if (!isSyncEngineEnabled()) return <>{children}</>;
  return <SyncEngineBootstrap>{children}</SyncEngineBootstrap>;
}

function SyncEngineBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    // One-shot initial fill: mint/load the client-group id, pull the metadata delta into db.base
    // (spec 16 seam), then materialize db.notes. Children render immediately — the reads gate on
    // useLiveQuery's first-tick `undefined` (skeleton), not on this promise. Reconnect/focus/poke
    // re-pulls attach to this same seam in spec 16.
    (async () => {
      await getClientGroupID();
      await pull();
      if (!cancelled) await rebuild();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <>{children}</>;
}
