import { label, note, noteCollaborator, noteLabel, syncCvr } from "@yapper/db";
import type { NoteMeta } from "@yapper/schemas";
import { and, eq, inArray, isNull, lte, max, ne } from "drizzle-orm";
import type { Executor } from "../notes/service";

/**
 * Client View Record read/write + cookie helpers (spec 16, ADR-0004), kept out of the route handler so
 * the CVR diff is unit-testable in isolation. The pull handler composes these inside one transaction:
 * `authorizedNotes` (the caller's current view) diffed against `readCvr` (the snapshot last sent at the
 * incoming cookie) yields `puts`/`dels`; a fresh `nextCookie` is issued and the new snapshot stored.
 */

/** Derive the `NoteMeta.lifecycle` from the two lifecycle timestamps (trashed wins over archived). */
function lifecycleOf(trashedAt: Date | null, archivedAt: Date | null): NoteMeta["lifecycle"] {
  if (trashedAt !== null) return "trashed";
  if (archivedAt !== null) return "archived";
  return "active";
}

/**
 * The caller's current authorized view — the **set form** of `@yapper/permissions`'
 * `effectivePermission != "none"`, so it never disagrees with the single-note gate (`resolvePerm`):
 * owned notes in **all** lifecycle states, plus notes they actively collaborate on that are still
 * shared and not trashed. Two queries folded into a `Map<id, NoteMeta>`. Labels ride only on owned
 * notes (a collaborator doesn't see the owner's private label organization → `labelIds: []`).
 */
export async function authorizedNotes(
  dbx: Executor,
  userId: string,
): Promise<Map<string, NoteMeta>> {
  const cols = {
    id: note.id,
    title: note.title,
    preview: note.preview,
    access: note.access,
    archivedAt: note.archivedAt,
    trashedAt: note.trashedAt,
    updatedAt: note.updatedAt,
    metaVersion: note.metaVersion,
  };

  const owned = await dbx.select(cols).from(note).where(eq(note.ownerId, userId));

  const shared = await dbx
    .select(cols)
    .from(noteCollaborator)
    .innerJoin(note, eq(noteCollaborator.noteId, note.id))
    .where(
      and(
        eq(noteCollaborator.userId, userId),
        eq(noteCollaborator.status, "active"),
        ne(note.access, "private"),
        isNull(note.trashedAt),
      ),
    );

  // Embed labels[] ids for the owner's own notes with one grouped query (no N+1), mirroring notesRouter.
  const labelIdsByNote = new Map<string, string[]>();
  if (owned.length > 0) {
    const links = await dbx
      .select({ noteId: noteLabel.noteId, labelId: noteLabel.labelId })
      .from(noteLabel)
      .innerJoin(label, eq(noteLabel.labelId, label.id))
      .where(
        inArray(
          noteLabel.noteId,
          owned.map((r) => r.id),
        ),
      );
    for (const link of links) {
      const list = labelIdsByNote.get(link.noteId) ?? [];
      list.push(link.labelId);
      labelIdsByNote.set(link.noteId, list);
    }
  }

  const view = new Map<string, NoteMeta>();
  for (const r of owned) {
    view.set(r.id, {
      id: r.id,
      title: r.title,
      preview: r.preview,
      access: r.access,
      lifecycle: lifecycleOf(r.trashedAt, r.archivedAt),
      labelIds: labelIdsByNote.get(r.id) ?? [],
      updatedAt: r.updatedAt.toISOString(),
      metaVersion: r.metaVersion,
      isOwner: true,
    });
  }
  for (const r of shared) {
    view.set(r.id, {
      id: r.id,
      title: r.title,
      preview: r.preview,
      access: r.access,
      lifecycle: lifecycleOf(r.trashedAt, r.archivedAt),
      labelIds: [],
      updatedAt: r.updatedAt.toISOString(),
      metaVersion: r.metaVersion,
      isOwner: false,
    });
  }
  return view;
}

/** Parse the wire cookie (opaque monotonic integer serialized to a string). Non-numeric → `null`. */
function parseCookie(cookie: string | null): number | null {
  if (cookie === null) return null;
  const n = Number(cookie);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Load the snapshot named by the incoming cookie. `matched` is `false` when the cookie is `null`,
 * non-numeric, unknown, or pruned — the empty-`prev` case that drives a full resync (`reset: true`).
 */
export async function readCvr(
  dbx: Executor,
  clientGroupID: string,
  cookie: string | null,
): Promise<{ prev: Record<string, number>; matched: boolean }> {
  const n = parseCookie(cookie);
  if (n === null) return { prev: {}, matched: false };
  const [row] = await dbx
    .select({ snapshot: syncCvr.snapshot })
    .from(syncCvr)
    .where(and(eq(syncCvr.clientGroupId, clientGroupID), eq(syncCvr.cookie, n)))
    .limit(1);
  if (!row) return { prev: {}, matched: false };
  return { prev: row.snapshot, matched: true };
}

/**
 * The next opaque cookie for the group: `(max stored cookie ?? 0) + 1`, computed server-side so it is
 * strictly monotonic, never client-controlled, and never collides with an existing row (ADR-0004). The
 * client-sent cookie only selects `prev`; it never dictates the next number.
 */
export async function nextCookie(dbx: Executor, clientGroupID: string): Promise<number> {
  const [row] = await dbx
    .select({ maxCookie: max(syncCvr.cookie) })
    .from(syncCvr)
    .where(eq(syncCvr.clientGroupId, clientGroupID));
  return (row?.maxCookie ?? 0) + 1;
}

/** Store the snapshot the view represents at the freshly issued cookie. */
export async function writeCvr(
  dbx: Executor,
  clientGroupID: string,
  cookie: number,
  snapshot: Record<string, number>,
): Promise<void> {
  await dbx.insert(syncCvr).values({ clientGroupId: clientGroupID, cookie, snapshot });
}

/**
 * Keep only the latest two cookies per group (the just-issued one and its predecessor, which a client
 * may still present if the prior response was lost in transit); a single-row-ish delete each pull.
 */
export async function pruneOldCookies(
  dbx: Executor,
  clientGroupID: string,
  newCookie: number,
): Promise<void> {
  await dbx
    .delete(syncCvr)
    .where(and(eq(syncCvr.clientGroupId, clientGroupID), lte(syncCvr.cookie, newCookie - 2)));
}

/** The CVR delta: new-or-changed notes (`puts`) and ids that left the view (`dels`). */
export function diffView(
  view: Map<string, NoteMeta>,
  prev: Record<string, number>,
): { puts: NoteMeta[]; dels: string[] } {
  const puts: NoteMeta[] = [];
  for (const n of view.values()) {
    const prior = prev[n.id];
    if (prior === undefined || n.metaVersion > prior) puts.push(n);
  }
  const dels = Object.keys(prev).filter((id) => !view.has(id));
  return { puts, dels };
}

/** Project a view into the `{ id → metaVersion }` snapshot stored in the CVR. */
export function snapshotOf(view: Map<string, NoteMeta>): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const n of view.values()) snapshot[n.id] = n.metaVersion;
  return snapshot;
}
