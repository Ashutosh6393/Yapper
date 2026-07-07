"use client";

import { type ReactNode, useEffect } from "react";
import { getClientGroupID } from "./db";
import { isSyncEngineEnabled } from "./flag";

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
    // Opens `yapper-sync` (Dexie opens lazily on first access) and mints/loads the client-group id.
    // No reads are gated on this yet, so children render immediately.
    void getClientGroupID();
  }, []);
  return <>{children}</>;
}
