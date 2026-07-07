import { label } from "@yapper/db";
import type { LabelColor } from "@yapper/schemas";
import { eq } from "drizzle-orm";
import type { Executor } from "../notes/service";

/**
 * Label DB writes, extracted from `labels/router.ts` so the REST routes (flag-off) and spec-19's
 * server mutators (flag-on) run the same SQL (spec 19, decisions ADR-001). No authorization here —
 * queries are owner-scoped by the values the caller passes.
 */

/** The row shape `POST /api/labels` and the `createLabel` mutator both return. */
export type CreatedLabel = { id: string; name: string; color: string };

/** Insert a label; `id` optional (server-generated for REST, client-minted for the mutator). */
export async function insertLabel(
  dbx: Executor,
  values: { id?: string; ownerId: string; name: string; color: LabelColor },
): Promise<CreatedLabel> {
  const [created] = await dbx
    .insert(label)
    .values(values)
    .returning({ id: label.id, name: label.name, color: label.color });
  if (!created) throw new Error("label insert returned no row");
  return created;
}

/** Rename a label. No REST endpoint today; the engine's `renameLabel` mutator is a new owner-gated write. */
export async function renameLabelById(dbx: Executor, id: string, name: string): Promise<void> {
  await dbx.update(label).set({ name }).where(eq(label.id, id));
}

/** Delete a label (FK cascade to note_label — notes keep existing, lose the label). */
export async function deleteLabelById(dbx: Executor, id: string): Promise<void> {
  await dbx.delete(label).where(eq(label.id, id));
}
