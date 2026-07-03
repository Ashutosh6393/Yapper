import { z } from "zod";
import { labelColorSchema, noteAccessSchema } from "./common";

/** A label as rendered on a note card: color dot + name. Owned notes only; never on shared/trash. */
export const labelChipSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: labelColorSchema,
});
export type LabelChip = z.infer<typeof labelChipSchema>;

/** A note row in a list — metadata only, never the CRDT blob. (`GET /api/notes`)
 * `labels` is present on owned summaries (empty for the trash view); defaults to `[]` when the
 * endpoint omits it (e.g. `/shared`). */
export const noteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  access: noteAccessSchema,
  updatedAt: z.string(),
  labels: z.array(labelChipSchema).default([]),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** Query params for `GET /api/notes` — which lifecycle view, plus an optional label filter.
 * `label` implies the `active` filter (owned active notes carrying that label). */
export const noteListQuerySchema = z.object({
  filter: z.enum(["active", "archived", "trashed"]).default("active"),
  label: z.string().optional(),
});
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

/** A "Shared with me" row — a summary plus the note-level access role and owner display name.
 * (`GET /api/notes/shared`) */
export const sharedNoteSummarySchema = noteSummarySchema.extend({
  ownerName: z.string(),
});
export type SharedNoteSummary = z.infer<typeof sharedNoteSummarySchema>;

/** Full note metadata. (`GET /api/notes/:id`) `isOwner` is present on get-one, gating owner UI. */
export const noteMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  access: noteAccessSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  isOwner: z.boolean().optional(),
});
export type NoteMetadata = z.infer<typeof noteMetadataSchema>;

/** Response of `POST /api/notes` — only the columns the create endpoint returns. */
export const createNoteResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  access: noteAccessSchema,
  updatedAt: z.string(),
});
export type CreateNoteResponse = z.infer<typeof createNoteResponseSchema>;
