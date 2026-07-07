import { label, note, noteLabel } from "@yapper/db";
import {
  bustNotePermissions,
  type PermissionCache,
  type RedisPublisher,
  revokeChannel,
  roleChangeChannel,
} from "@yapper/permissions";
import type { Mutation, MutationName, PushRejectReason } from "@yapper/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { deleteLabelById, insertLabel, renameLabelById } from "../labels/service";
import { createNoteRecord } from "../notes/create";
import {
  archiveNote,
  type Executor,
  makeNotePrivate,
  mintShareToken,
  permanentlyDeleteNote,
  renameNote,
  restoreNote,
  setNoteShareLevel,
  trashNote,
  unarchiveNote,
} from "../notes/service";

/**
 * The **server**-mutator registry (spec 19, ADR-0007): one authoritative function per canonical
 * mutation name. Each runs inside the push transaction — it authorizes (owner-gate / permission),
 * applies the write by reusing the extracted service functions (so REST and engine can't drift), and
 * bumps `meta_version` for every surviving note it touches. A **permanent** failure throws a typed
 * {@link MutationRejected}; an unexpected failure throws through (→ 5xx, transient). Side effects that
 * must run outside the txn (cache bust, Redis publish) are returned as a {@link PostCommit} the push
 * handler runs after commit.
 */

/** A permanent, deny-by-default rejection. Only these four reasons yield a `rejected` verdict; any
 * other throw aborts the request (5xx / transient). */
export class MutationRejected extends Error {
  constructor(public reason: PushRejectReason) {
    super(reason);
    this.name = "MutationRejected";
  }
}

/** Deps a post-commit side effect needs; injected by the push handler (mockable in tests). */
export type PostCommitDeps = {
  permCache: PermissionCache | null;
  publisher: RedisPublisher | null;
};

/** A side effect the push handler runs **after** the mutation's transaction commits. */
export type PostCommit = (deps: PostCommitDeps) => Promise<void>;

/** Auth + transaction context handed to every server mutator. */
export type MutationCtx = { userId: string; tx: Executor };

type ArgsOf<K extends MutationName> = Extract<Mutation, { name: K }>["args"];
type ServerMutator<K extends MutationName> = (
  ctx: MutationCtx,
  args: ArgsOf<K>,
) => Promise<PostCommit | void>;
type ServerMutatorRegistry = { [K in MutationName]: ServerMutator<K> };

/** `UPDATE note SET meta_version = meta_version + 1` — the mandatory staleness bump (goal #10). */
export async function bumpMetaVersion(dbx: Executor, noteId: string): Promise<void> {
  await dbx
    .update(note)
    .set({ metaVersion: sql`${note.metaVersion} + 1` })
    .where(eq(note.id, noteId));
}

/** Bump `meta_version` on every note carrying a label (its chip text/presence changed). */
async function bumpMetaVersionForLabel(dbx: Executor, labelId: string): Promise<void> {
  await dbx
    .update(note)
    .set({ metaVersion: sql`${note.metaVersion} + 1` })
    .where(
      inArray(
        note.id,
        dbx.select({ id: noteLabel.noteId }).from(noteLabel).where(eq(noteLabel.labelId, labelId)),
      ),
    );
}

/** Load + owner-gate a note. Missing → `not_found`; not owned → `forbidden`. */
async function requireOwnedNote(
  dbx: Executor,
  id: string,
  userId: string,
): Promise<{ ownerId: string; shareToken: string | null; trashedAt: Date | null }> {
  const [row] = await dbx
    .select({ ownerId: note.ownerId, shareToken: note.shareToken, trashedAt: note.trashedAt })
    .from(note)
    .where(eq(note.id, id))
    .limit(1);
  if (!row) throw new MutationRejected("not_found");
  if (row.ownerId !== userId) throw new MutationRejected("forbidden");
  return row;
}

/** Load + owner-gate a label. Missing → `not_found`; not owned → `forbidden`. */
async function requireOwnedLabel(dbx: Executor, id: string, userId: string): Promise<void> {
  const [row] = await dbx
    .select({ ownerId: label.ownerId })
    .from(label)
    .where(eq(label.id, id))
    .limit(1);
  if (!row) throw new MutationRejected("not_found");
  if (row.ownerId !== userId) throw new MutationRejected("forbidden");
}

/** True if the owner already has a *different* label with this name (unique (owner, name) guard). */
async function nameTakenByOther(
  dbx: Executor,
  userId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const [row] = await dbx
    .select({ id: label.id })
    .from(label)
    .where(and(eq(label.ownerId, userId), eq(label.name, name)))
    .limit(1);
  return row ? row.id !== exceptId : false;
}

export const serverMutators: ServerMutatorRegistry = {
  // Idempotent create at a client-minted id (ADR-0006). A fresh row starts at meta_version 0 (no bump);
  // a different owner holding the id is a permanent reject.
  createNote: async ({ userId, tx }, { id }) => {
    const result = await createNoteRecord(userId, id, tx);
    if (result.status === "conflict") throw new MutationRejected("forbidden");
  },

  renameNote: async ({ userId, tx }, { id, title }) => {
    await requireOwnedNote(tx, id, userId);
    await renameNote(tx, id, title);
    await bumpMetaVersion(tx, id);
  },

  archiveNote: async ({ userId, tx }, { id }) => {
    await requireOwnedNote(tx, id, userId);
    await archiveNote(tx, id);
    await bumpMetaVersion(tx, id);
  },

  unarchiveNote: async ({ userId, tx }, { id }) => {
    await requireOwnedNote(tx, id, userId);
    await unarchiveNote(tx, id);
    await bumpMetaVersion(tx, id);
  },

  trashNote: async ({ userId, tx }, { id }) => {
    await requireOwnedNote(tx, id, userId);
    await trashNote(tx, id);
    await bumpMetaVersion(tx, id);
    return async ({ permCache }) => bustNotePermissions(permCache, id);
  },

  restoreNote: async ({ userId, tx }, { id }) => {
    await requireOwnedNote(tx, id, userId);
    await restoreNote(tx, id);
    await bumpMetaVersion(tx, id);
    return async ({ permCache }) => bustNotePermissions(permCache, id);
  },

  // Reachable only from Trash: a non-trashed note is a state conflict. Row gone ⇒ no bump (CVR del).
  permanentDeleteNote: async ({ userId, tx }, { id }) => {
    const row = await requireOwnedNote(tx, id, userId);
    if (row.trashedAt === null) throw new MutationRejected("conflict");
    await permanentlyDeleteNote(tx, id);
  },

  setShareLevel: async ({ userId, tx }, { id, level }) => {
    const row = await requireOwnedNote(tx, id, userId);
    const token = row.shareToken ?? mintShareToken();
    await setNoteShareLevel(tx, id, level, token);
    await bumpMetaVersion(tx, id);
    return async ({ permCache, publisher }) => {
      await bustNotePermissions(permCache, id);
      await publisher?.publish(roleChangeChannel(id), JSON.stringify({ newLevel: level }));
    };
  },

  makePrivate: async ({ userId, tx }, { id }) => {
    await requireOwnedNote(tx, id, userId);
    await makeNotePrivate(tx, id);
    await bumpMetaVersion(tx, id);
    return async ({ permCache, publisher }) => {
      await bustNotePermissions(permCache, id);
      await publisher?.publish(revokeChannel(id), JSON.stringify({ reason: "made_private" }));
    };
  },

  // Owner-scoped, idempotent on id; a *different* label with the same name is a conflict (unique guard).
  createLabel: async ({ userId, tx }, { id, name, color }) => {
    const [existing] = await tx
      .select({ ownerId: label.ownerId })
      .from(label)
      .where(eq(label.id, id))
      .limit(1);
    if (existing) {
      if (existing.ownerId !== userId) throw new MutationRejected("forbidden");
      return; // idempotent replay
    }
    if (await nameTakenByOther(tx, userId, name, null)) throw new MutationRejected("conflict");
    await insertLabel(tx, { id, ownerId: userId, name, color });
  },

  renameLabel: async ({ userId, tx }, { id, name }) => {
    await requireOwnedLabel(tx, id, userId);
    if (await nameTakenByOther(tx, userId, name, id)) throw new MutationRejected("conflict");
    await renameLabelById(tx, id, name);
    await bumpMetaVersionForLabel(tx, id);
  },

  deleteLabel: async ({ userId, tx }, { id }) => {
    await requireOwnedLabel(tx, id, userId);
    await bumpMetaVersionForLabel(tx, id); // bump carriers before the cascade drops the links
    await deleteLabelById(tx, id);
  },

  applyLabel: async ({ userId, tx }, { noteId, labelId }) => {
    await requireOwnedNote(tx, noteId, userId);
    await requireOwnedLabel(tx, labelId, userId);
    await tx.insert(noteLabel).values({ noteId, labelId }).onConflictDoNothing();
    await bumpMetaVersion(tx, noteId);
  },

  removeLabel: async ({ userId, tx }, { noteId, labelId }) => {
    await requireOwnedNote(tx, noteId, userId);
    await tx
      .delete(noteLabel)
      .where(and(eq(noteLabel.noteId, noteId), eq(noteLabel.labelId, labelId)));
    await bumpMetaVersion(tx, noteId);
  },
};

/**
 * Type-safe dispatch: narrows the discriminated `Mutation` so `serverMutators[m.name]` and `m.args`
 * are correlated. The push handler calls this per mutation inside its transaction.
 */
export function applyServerMutation(ctx: MutationCtx, m: Mutation): Promise<PostCommit | void> {
  // `m` is a union member, so name↔args are correlated; the registry entry accepts exactly this member.
  const run = serverMutators[m.name] as ServerMutator<typeof m.name>;
  return run(ctx, m.args);
}
