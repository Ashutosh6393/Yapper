import type { Label, LabelChip, Mutation, MutationName, NoteMeta } from "@yapper/schemas";
import Dexie, { type EntityTable } from "dexie";

/**
 * The client's durable local store for the sync engine (ADR-0003). Dexie wraps IndexedDB; this module
 * defines the canonical `yapper-sync` schema, the `clientGroupID` identity bootstrap, and the
 * `rebuild()` materialization primitive. Nothing here runs unless `NEXT_PUBLIC_SYNC_ENGINE` is on (see
 * `flag.ts`). Spec 14 shipped the skeleton; spec 15 implements the read path (`rebuild()` + selectors).
 */

/** Authoritative note-meta row the puller writes into `db.base`. The wire/base shape (`NoteMeta`). */
export type BaseRow = NoteMeta;

/** A queued local mutation: the `Mutation` envelope tagged with its monotonic apply `seq`. */
export type MutationRow = { seq: number } & Mutation;

/** A `db.sync` singleton row (clientGroupID | cookie | lastMutationID). `userId` is set on the
 * `clientGroupID` row only — the user it was minted for (spec 26b). */
export type SyncRow = { key: string; value: string; userId?: string };

/**
 * A materialized `db.notes` row the UI reads. `NoteMeta` (label **ids**) + resolved `labels` chips —
 * a superset of `NoteSummary`, so the dashboard cards consume it with no prop-type change. `isOwner`
 * (inherited from `NoteMeta`) now rides on base rows from the puller — it gates owner-only UI and
 * separates owned from shared notes locally. A local rendering type — NOT a wire shape.
 */
export interface LocalNote extends NoteMeta {
  labels: LabelChip[];
}

/** A `db.labels` row — mirrors the `Label` wire shape (filled by the puller / mutators, specs 16/19). */
export type LocalLabel = Label;

/** The typed `yapper-sync` database. */
export type SyncDatabase = Dexie & {
  base: EntityTable<BaseRow, "id">;
  notes: EntityTable<LocalNote, "id">;
  mutations: EntityTable<MutationRow, "seq">;
  labels: EntityTable<LocalLabel, "id">;
  sync: EntityTable<SyncRow, "key">;
};

export const db = new Dexie("yapper-sync") as SyncDatabase;
db.version(1).stores({
  base: "id", // authoritative note-meta rows — puller writes only
  notes: "id", // materialized view the UI reads via useLiveQuery
  mutations: "++seq, id", // pending queue; auto-inc seq = apply order; index by note id
  labels: "id", // label rows
  sync: "key", // singletons: clientGroupID | cookie | lastMutationID
});
// Spec 15: the materialized view gains lifecycle/updatedAt/multiEntry-labelIds indexes for the list
// selectors. db.notes is disposable (rebuildable from base + queue), so this needs no data migration —
// the next rebuild() repopulates it. base/mutations/labels/sync are unchanged.
db.version(2).stores({
  notes: "id, lifecycle, updatedAt, *labelIds",
});

const CLIENT_GROUP_ID_KEY = "clientGroupID";

/**
 * The canonical client-group identity shared by push and pull. Minted via `crypto.randomUUID()`,
 * persisted in `db.sync`, and stable across tabs (IndexedDB is origin-scoped) and reloads. A first-mint
 * race between two tabs is benign: the `put` is keyed on `key`, so it is last-write-wins and both tabs
 * converge on one id.
 *
 * **Scoped to the user who minted it** (spec 26b, ADR-003): the server binds a client group to its first
 * pushing user and rejects anyone else with a `403`, forever. So an id that outlives the user permanently
 * jams the queue. 26a's sign-out wipe should mean this never fires — it fires when the wipe *didn't*
 * happen (a crash, a force-quit, a failed delete), which is exactly when the alternative is a permanent,
 * silent failure. `userId === null` (session not yet mirrored) reuses the row rather than re-minting on a
 * momentary unknown.
 */
export async function getClientGroupID(userId: string | null): Promise<string> {
  const row = await db.sync.get(CLIENT_GROUP_ID_KEY);
  if (row && (userId === null || row.userId === userId)) return row.value;
  const id = crypto.randomUUID();
  await db.sync.put({ key: CLIENT_GROUP_ID_KEY, value: id, ...(userId ? { userId } : {}) });
  return id;
}

/**
 * The in-memory draft `rebuild()` folds the queue into: authoritative notes + labels keyed by id,
 * seeded from `db.base` / `db.labels` (ADR-0007). Client mutators mutate it in place — the notes map is
 * the optimistic note view; the labels map is the optimistic sidebar list (create/rename/delete labels).
 */
export type WorkingSet = { notes: Map<string, NoteMeta>; labels: Map<string, LocalLabel> };

/** A pure, replayable client mutator: apply one mutation's effect to the working set in place. */
export type ClientMutator = (draft: WorkingSet, args: unknown) => void;

// The per-name client-mutator registry. Spec 15 defines the dispatch + fold; **spec 19 registers the
// 14 bodies.** Empty until then — and the queue is empty until 19 too, so the fold is a no-op and
// rebuild() = base → materialized mirror.
const clientMutators = new Map<MutationName, ClientMutator>();

/** Register a client mutator body (spec 19 wires the 14; tests register minimal ones to drive replay). */
export function registerClientMutator(name: MutationName, mutator: ClientMutator): void {
  clientMutators.set(name, mutator);
}

/**
 * Dispatch one queued mutation onto the draft. Replay is **total**: an unregistered name is a
 * programmer error (throws), never a silent skip — a missing mutator means the queue can't be replayed.
 */
export function applyClientMutation(draft: WorkingSet, mutation: MutationRow): void {
  const mutator = clientMutators.get(mutation.name);
  if (!mutator) throw new Error(`No client mutator registered for "${mutation.name}"`);
  mutator(draft, mutation.args);
}

/**
 * Recompute `db.notes = replay(db.mutations) over db.base`. The shared primitive run after every local
 * mutation and every pull. Pure, total, deterministic: it fully recomputes the materialized view
 * (clear + bulkPut, never a diff) so re-running yields identical rows. Wrapped in one `rw` transaction
 * over all four tables so a concurrent pull/mutate can't observe or interleave a half-applied view.
 */
export async function rebuild(): Promise<void> {
  await db.transaction("rw", db.base, db.mutations, db.labels, db.notes, async () => {
    // 1. Seed the working set from the authoritative base rows + labels.
    const draft: WorkingSet = { notes: new Map(), labels: new Map() };
    for (const row of await db.base.toArray()) draft.notes.set(row.id, { ...row });
    for (const label of await db.labels.toArray()) draft.labels.set(label.id, { ...label });

    // 2. Replay the pending queue in monotonic seq order (pure client mutators; bodies = spec 19).
    const queued = await db.mutations.orderBy("seq").toArray();
    for (const mutation of queued) applyClientMutation(draft, mutation);

    // 3. Materialize notes: resolve label chips from the folded labels, dropping ids with no row.
    const materialized: LocalNote[] = [...draft.notes.values()].map((note) => ({
      ...note,
      labels: note.labelIds.flatMap((id) => {
        const label = draft.labels.get(id);
        return label ? [{ id: label.id, name: label.name, color: label.color }] : [];
      }),
    }));

    // 4. Replace the disposable tables from the folded set — deterministic, no drift. db.labels is
    // rewritten too so optimistic label create/rename/delete show in the sidebar before the pull.
    await db.notes.clear();
    await db.notes.bulkPut(materialized);
    await db.labels.clear();
    await db.labels.bulkPut([...draft.labels.values()]);
  });
}
