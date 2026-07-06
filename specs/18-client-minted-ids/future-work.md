# 18 · Client-minted note IDs & idempotent create — Future Work

Deferred items, out of scope for this slice:

- **Retire the legacy `POST /api/notes` create + response id echo.** Once spec 19 flips
  `NEXT_PUBLIC_SYNC_ENGINE` on and all creates ride `/api/sync/push`, make `id` **required**, drop the
  server-generated no-id path, and stop echoing the id in the response (the ADR-0006 end state). Owned by the
  spec 19 flag-flip cleanup, not this slice.
- **Richer `createNote` args.** `createNoteArgsSchema` is `{ id }` today. If a flow ever needs to create a
  note pre-seeded with a title or share level (e.g. "New note from template"), extend the schema with
  optional `title` / `access` — additive, non-breaking. Not needed now (title/access come from `renameNote` /
  `setShareLevel` + content-lane derivation).
- **UUID collision telemetry.** A `conflict` (`id_conflict`) is expected only for a hostile/buggy client, but
  a real v4 collision would also surface here. Consider a low-volume server log/metric on the `conflict`
  branch so a genuine (astronomically unlikely) collision or a client-id-generation bug is observable.
- **Client id-format hardening.** This spec relies on `crypto.randomUUID()`; if a non-UUID id scheme is ever
  wanted (e.g. sortable ULIDs for CVR ordering), that is a contract change to `createNoteArgsSchema` and the
  `note.id` column type — a separate ADR.
- **Batch create.** No multi-note create in one request; each note is its own `createNote` mutation. Revisit
  only if a bulk-import feature needs it.
