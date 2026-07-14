import { db } from "./db";
import { pull } from "./pull";
import { push } from "./push";

/**
 * Sign-out teardown for the local sync engine (spec 26a, ADR-001/ADR-002). Everything the engine keeps is
 * scoped to the signed-in user — the note metadata, the note content docs, the mutation queue and the
 * `clientGroupID` — and none of it survived sign-out before, so the next user on the browser rendered the
 * previous user's notes. `signOut` now flushes what it can, asks before discarding what it can't, and then
 * deletes the lot.
 */

/**
 * Drain the queue and report what's still unsynced. Push settles the batch; the pull that follows is what
 * actually *drops* the confirmed seqs (the server acks via `lastMutationID` — spec 16), so both run before
 * the count means anything. Offline / blocked → the count is non-zero and the caller must confirm.
 */
export async function flushPending(): Promise<number> {
  if ((await db.mutations.count()) === 0) return 0;
  await push();
  await pull();
  return db.mutations.count();
}

/**
 * Delete every local trace of the signed-in user: the whole `yapper-sync` Dexie database and the
 * y-indexeddb content store per note (`content-sync.ts` names each one after its note id). Deleting Dexie
 * also drops the `clientGroupID`, so the next sign-in mints a fresh one — a stale client-group binding
 * (which permanently 403s every push) cannot outlive the user.
 */
export async function resetLocalEngine(): Promise<void> {
  const noteIds = new Set([
    ...(await db.base.toCollection().primaryKeys()),
    ...(await db.notes.toCollection().primaryKeys()),
  ]);
  await db.delete();
  await Promise.all([...noteIds].map(deleteDatabase));
}

/** `indexedDB.deleteDatabase` as a promise. A blocked/failed delete must not wedge sign-out. */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
