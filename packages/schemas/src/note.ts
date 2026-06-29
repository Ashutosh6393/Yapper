import { z } from "zod";
import { noteAccessSchema } from "./common";

/** A note row in a list — metadata only, never the CRDT blob. (`GET /api/notes`) */
export const noteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** A "Shared with me" row — a summary plus the note-level access role. (`GET /api/notes/shared`) */
export const sharedNoteSummarySchema = noteSummarySchema.extend({
  access: noteAccessSchema,
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
