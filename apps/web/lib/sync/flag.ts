/**
 * The single gate for the local-first sync engine (spec 14). The engine — Dexie store, provider,
 * and every sibling's pusher/puller/poke (specs 15–21) — is inert unless this returns `true`.
 *
 * This is the ONLY file that reads `NEXT_PUBLIC_SYNC_ENGINE`; everything else calls this helper.
 * With the flag off (the default, including prod) the app is byte-for-byte today's TanStack Query
 * notes path.
 */
export function isSyncEngineEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SYNC_ENGINE === "1";
}
