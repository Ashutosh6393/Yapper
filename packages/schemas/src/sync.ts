import { z } from "zod";
import { labelColorSchema, noteAccessSchema } from "./common";

/**
 * Wire contracts for the local-first sync engine (ADR-0002, spec 14). The single source of truth for
 * the push/pull/poke formats and the 14 canonical mutation names, imported by `apps/web` (pusher/
 * puller, specs 16/19) and `apps/api` (`/api/sync/*`, specs 16/19). Spec 14 fixes the **envelope and
 * the names**; later specs may extend additively but must not rename. Reuses `./common` enums — never
 * redefine the access/palette shapes here.
 */

/**
 * The authoritative per-note metadata row the puller returns and `db.base` stores. The wire/base
 * shape: label **ids** only (chips are resolved client-side in spec 15) and `metaVersion` (mirrors the
 * server's `note.meta_version`, bumped on every authoritative metadata write — ADR-0004).
 */
export const noteMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  access: noteAccessSchema,
  lifecycle: z.enum(["active", "archived", "trashed"]),
  labelIds: z.array(z.string()),
  updatedAt: z.string(),
  metaVersion: z.number(),
});
export type NoteMeta = z.infer<typeof noteMetaSchema>;

/**
 * The 14 canonical mutation names (ADR-0007). Do not rename — siblings (specs 16/19/20) reference
 * these. Exported as an enum so the pusher and server can enumerate names.
 */
export const mutationNameSchema = z.enum([
  "createNote",
  "renameNote",
  "archiveNote",
  "unarchiveNote",
  "trashNote",
  "restoreNote",
  "permanentDeleteNote",
  "setShareLevel",
  "makePrivate",
  "createLabel",
  "renameLabel",
  "deleteLabel",
  "applyLabel",
  "removeLabel",
]);
export type MutationName = z.infer<typeof mutationNameSchema>;

/** A named mutation with its typed args — a discriminated union on `name`. */
export const mutationSchema = z.discriminatedUnion("name", [
  // id is client-minted (spec 18); title optional at create.
  z.object({
    name: z.literal("createNote"),
    args: z.object({ id: z.string(), title: z.string().optional() }),
  }),
  z.object({
    name: z.literal("renameNote"),
    args: z.object({ id: z.string(), title: z.string() }),
  }),
  z.object({ name: z.literal("archiveNote"), args: z.object({ id: z.string() }) }),
  z.object({ name: z.literal("unarchiveNote"), args: z.object({ id: z.string() }) }),
  z.object({ name: z.literal("trashNote"), args: z.object({ id: z.string() }) }),
  z.object({ name: z.literal("restoreNote"), args: z.object({ id: z.string() }) }),
  z.object({ name: z.literal("permanentDeleteNote"), args: z.object({ id: z.string() }) }),
  z.object({
    name: z.literal("setShareLevel"),
    args: z.object({ id: z.string(), level: z.enum(["view", "edit"]) }),
  }),
  z.object({ name: z.literal("makePrivate"), args: z.object({ id: z.string() }) }),
  z.object({
    name: z.literal("createLabel"),
    args: z.object({ id: z.string(), name: z.string(), color: labelColorSchema }),
  }),
  z.object({
    name: z.literal("renameLabel"),
    args: z.object({ id: z.string(), name: z.string() }),
  }),
  z.object({ name: z.literal("deleteLabel"), args: z.object({ id: z.string() }) }),
  z.object({
    name: z.literal("applyLabel"),
    args: z.object({ noteId: z.string(), labelId: z.string() }),
  }),
  z.object({
    name: z.literal("removeLabel"),
    args: z.object({ noteId: z.string(), labelId: z.string() }),
  }),
]);
export type Mutation = z.infer<typeof mutationSchema>;

/**
 * The push queue envelope. The pusher sends `{ seq, name, args }` per mutation; the server re-validates
 * each `args` against the matching `mutationSchema` member (spec 19 owns the pusher).
 */
export const pushRequestSchema = z.object({
  clientGroupID: z.uuid(),
  mutations: z.array(z.object({ seq: z.number(), name: mutationNameSchema, args: z.unknown() })),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/**
 * The four deny-by-default permanent-reject reasons a server mutator can raise (ADR-0009). Finalized by
 * spec 21 as a named enum so the api push handler, the web classifier, and the toast-copy map all
 * reference one contract (never a per-app literal). `forbidden` = permission denied (`403`), `invalid` =
 * arg re-validation failure (`422`), `conflict` = illegal state (`409`), `not_found` = missing row
 * (`404`). Request-level failures (`401`/`429`/`5xx`/offline) are NOT reasons — they are transient and
 * ride outside a `200` body (see the web classifier, spec 21).
 */
export const pushRejectReasonSchema = z.enum(["forbidden", "invalid", "conflict", "not_found"]);
export type PushRejectReason = z.infer<typeof pushRejectReasonSchema>;

/**
 * A per-mutation verdict (ADR-0009). `reason` is present only on a permanent reject — one of the four
 * {@link pushRejectReasonSchema} codes a server mutator can raise (spec 19).
 */
export const pushVerdictSchema = z.object({
  seq: z.number(),
  status: z.enum(["applied", "rejected"]),
  reason: pushRejectReasonSchema.optional(),
});
export type PushVerdict = z.infer<typeof pushVerdictSchema>;

/**
 * The push response — the server's per-mutation verdicts plus the advanced `lastMutationID`. Transient
 * failures (offline/5xx/network) are NOT verdicts: the server leaves those unprocessed and does not
 * advance `lastMutationID` (classification implemented in spec 21).
 */
export const pushResponseSchema = z.object({
  lastMutationID: z.number(),
  verdicts: z.array(pushVerdictSchema),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

/** A pull request keyed by client-group, carrying the opaque cursor (`null` on the first pull). */
export const pullRequestSchema = z.object({
  clientGroupID: z.uuid(),
  cookie: z.string().nullable(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

/**
 * The pull response (CVR delta — semantics owned by spec 16; spec 14 fixes the envelope). `cookie` is
 * opaque and monotonic per client-group (never wall-clock — ADR-0004). `reset` is the one **additive**
 * spec-16 extension (spec 14 permits additive changes, not renames): `true` only when the server's
 * `prev` CVR was empty (first pull, or an unknown/pruned cookie), so the client cannot rely on `dels`
 * to name its orphaned local rows and must reconcile by missing-as-delete (decisions ADR-003).
 */
export const pullResponseSchema = z.object({
  puts: z.array(noteMetaSchema),
  dels: z.array(z.string()),
  lastMutationID: z.number(),
  cookie: z.string(),
  reset: z.boolean().optional(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

/**
 * A content-free "you have changes — pull now" nudge (ADR-0005). The SSE transport and Redis channel
 * are spec 17; kept here so the server and the client subscriber type against the same shape.
 */
export const pokeEventSchema = z.object({ type: z.literal("poke") });
export type PokeEvent = z.infer<typeof pokeEventSchema>;
