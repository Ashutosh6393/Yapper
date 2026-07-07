import type { Mutation, NoteMeta } from "@yapper/schemas";
import Dexie, { type EntityTable } from "dexie";

/**
 * The client's durable local store for the sync engine (ADR-0003, spec 14). Dexie wraps IndexedDB;
 * this module defines the canonical `yapper-sync` schema, the `clientGroupID` identity bootstrap, and
 * the `rebuild()` seam. Spec 15 fills in the read/replay behavior — spec 14 ships only the skeleton,
 * and nothing here runs unless `NEXT_PUBLIC_SYNC_ENGINE` is on (see `flag.ts`).
 */

/** Authoritative note-meta row the puller writes into `db.base`. The wire/base shape (`NoteMeta`). */
export type BaseRow = NoteMeta;

/** A queued local mutation: the `Mutation` envelope tagged with its monotonic apply `seq`. */
export type MutationRow = { seq: number } & Mutation;

/** A `db.sync` singleton row (clientGroupID | cookie | lastMutationID). */
export type SyncRow = { key: string; value: string };

/** Materialized view the UI reads (spec 15 extends this — keep minimal here). */
export type NoteRow = { id: string };

/** Label row (spec 15 extends this — keep minimal here). */
export type LabelRow = { id: string };

/** The typed `yapper-sync` database. Tables are indexed by the `db.version(1)` store spec below. */
export type SyncDatabase = Dexie & {
  base: EntityTable<BaseRow, "id">;
  notes: EntityTable<NoteRow, "id">;
  mutations: EntityTable<MutationRow, "seq">;
  labels: EntityTable<LabelRow, "id">;
  sync: EntityTable<SyncRow, "key">;
};

export const db = new Dexie("yapper-sync") as SyncDatabase;
db.version(1).stores({
  base: "id", // authoritative note-meta rows — puller writes only
  notes: "id", // materialized view the UI reads via useLiveQuery (spec 15)
  mutations: "++seq, id", // pending queue; auto-inc seq = apply order; index by note id
  labels: "id", // label rows
  sync: "key", // singletons: clientGroupID | cookie | lastMutationID
});

const CLIENT_GROUP_ID_KEY = "clientGroupID";

/**
 * The canonical client-group identity shared by push and pull. Minted once per browser via
 * `crypto.randomUUID()`, persisted in `db.sync`, and stable across tabs (IndexedDB is origin-scoped)
 * and reloads. A first-mint race between two tabs is benign: the `put` is keyed on `key`, so it is
 * last-write-wins and both tabs converge on one id.
 */
export async function getClientGroupID(): Promise<string> {
  const row = await db.sync.get(CLIENT_GROUP_ID_KEY);
  if (row) return row.value;
  const id = crypto.randomUUID();
  await db.sync.put({ key: CLIENT_GROUP_ID_KEY, value: id });
  return id;
}

/**
 * Recompute `db.notes = replay(db.mutations) over db.base`. The shared primitive run after every local
 * mutation and every pull. Spec 14 defines this seam only; **spec 15 implements the replay body.** The
 * throwing stub is a tripwire against anyone relying on it before 15 lands (the flag keeps it out of
 * the live path regardless).
 */
export async function rebuild(): Promise<void> {
  throw new Error("rebuild() not implemented — spec 15");
}
