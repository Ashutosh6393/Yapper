import { z } from "zod";
import { noteAccessSchema } from "./common";

/**
 * Body of `POST /api/notes/:id/share`. Sharing grants collaborators `view` or `edit`;
 * `private` is set via the separate make-private endpoint, not here.
 */
export const shareNoteBodySchema = z.object({
  level: z.enum(["view", "edit"]),
});
export type ShareNoteBody = z.infer<typeof shareNoteBodySchema>;

/** Response of `POST /api/notes/:id/share` — the capability link + the new access level. */
export const shareInfoSchema = z.object({
  token: z.string(),
  url: z.string(),
  access: noteAccessSchema,
});
export type ShareInfo = z.infer<typeof shareInfoSchema>;

/** Note summary shown on the `/share/:token` join page before joining. (`GET /api/share/:token`) */
export const shareSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  access: noteAccessSchema,
});
export type ShareSummary = z.infer<typeof shareSummarySchema>;

/** Response of `POST /api/share/:token/join` — where to redirect after joining. */
export const joinResponseSchema = z.object({ noteId: z.string() });
export type JoinResponse = z.infer<typeof joinResponseSchema>;
