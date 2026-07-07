import { db, note } from "@yapper/db";
import type { NoteAccess } from "@yapper/schemas";
import { eq } from "drizzle-orm";
import type { Executor } from "./service";

/** Result of an idempotent, owner-checked create (ADR-0006). A discriminated union, never a cast. */
export type CreateNoteResult =
  | {
      status: "created" | "exists";
      row: { id: string; title: string; access: NoteAccess; updatedAt: Date };
    }
  | { status: "conflict"; reason: "id_conflict" };

/**
 * Idempotently create an owned note at a client-supplied id (ADR-0006). Reused by `POST /api/notes`
 * (flag-off) and spec 19's `/api/sync/push` `createNote` server mutator (flag-on) — the mutator passes
 * its push transaction as `dbx` so the insert and the de-dup pointer commit atomically. The caller
 * validates `id` against `createNoteArgsSchema` first (well-formed UUID). Server-authoritative:
 * `owner_id` is the session user; client ownership/timestamps beyond the id are never trusted.
 *
 * - `created` — first write for this id.
 * - `exists`  — same-owner replay; `ON CONFLICT DO NOTHING` was a no-op, existing row returned untouched.
 * - `conflict` — id owned by a different user; a permanent reject (never overwrite, never report success).
 */
export async function createNoteRecord(
  userId: string,
  id: string,
  dbx: Executor = db,
): Promise<CreateNoteResult> {
  // INSERT … ON CONFLICT (id) DO NOTHING RETURNING → a row present ⇒ we inserted; empty ⇒ id exists.
  const [inserted] = await dbx
    .insert(note)
    .values({ id, ownerId: userId })
    .onConflictDoNothing({ target: note.id })
    .returning({ id: note.id, title: note.title, access: note.access, updatedAt: note.updatedAt });
  if (inserted) return { status: "created", row: inserted };

  // The id already exists. Idempotent iff the same owner; a different owner is a permanent reject.
  const [existing] = await dbx
    .select({
      ownerId: note.ownerId,
      id: note.id,
      title: note.title,
      access: note.access,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .where(eq(note.id, id))
    .limit(1);
  if (!existing || existing.ownerId !== userId)
    return { status: "conflict", reason: "id_conflict" };
  return {
    status: "exists",
    row: {
      id: existing.id,
      title: existing.title,
      access: existing.access,
      updatedAt: existing.updatedAt,
    },
  };
}
