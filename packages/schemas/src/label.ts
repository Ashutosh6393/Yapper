import { z } from "zod";
import { labelColorSchema } from "./common";

/** A label in the sidebar list: identity + color + count of active owned notes carrying it.
 * (`GET /api/labels`) */
export const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: labelColorSchema,
  noteCount: z.number(),
});
export type Label = z.infer<typeof labelSchema>;

/** Body for `POST /api/labels` — create a label (name + a palette color). */
export const createLabelBodySchema = z.object({
  name: z.string().min(1).max(50),
  color: labelColorSchema,
});
export type CreateLabelBody = z.infer<typeof createLabelBodySchema>;

/** Body for `PUT /api/notes/:id/labels` — replace the note's whole label set. */
export const setNoteLabelsBodySchema = z.object({
  labelIds: z.array(z.string()),
});
export type SetNoteLabelsBody = z.infer<typeof setNoteLabelsBodySchema>;
