import { z } from "zod";

/**
 * Body of `POST /api/notes/:id/share`. Sharing grants collaborators `view` or `edit`;
 * `private` is set via the separate make-private endpoint, not here.
 */
export const shareNoteBodySchema = z.object({
  level: z.enum(["view", "edit"]),
});
export type ShareNoteBody = z.infer<typeof shareNoteBodySchema>;
