# 6. Client-minted note IDs and idempotent create

Date: 2026-07-05

## Status

Accepted. Prerequisite for offline create in the metadata lane (ADR-0002, ADR-0007).

## Context

True local-first means a note created **offline** must have a stable identity immediately: its body in `y-indexeddb` is keyed by the note id (ADR-0008), and queued mutations reference it (labels, rename, lifecycle) before any server round-trip. Today the id is **server-generated** in `POST /api/notes` (`apps/api/src/notes/router.ts`), so the client cannot key content or enqueue dependent mutations until the network answers. Threading a temporary id through the queue and remapping it to a real id on first sync is error-prone.

## Decision

**The client mints the note id** (`crypto.randomUUID()`) at create time, and the server accepts it. Create becomes a queued named mutation `createNote({ id, ... })` (ADR-0007) whose server handler is **idempotent**:

```
INSERT INTO note (id, owner_id, title, access, ...) VALUES (:id, ...)
ON CONFLICT (id) DO NOTHING
```

- The same `id` is used by the metadata lane (`db.base`/`db.notes` key, CVR key) and the content lane (`y-indexeddb` doc name, `note_doc.note_id`).
- The server validates that `id` is a well-formed UUID and that the caller owns the create (owner = session user); it never trusts client-supplied ownership or timestamps beyond the id itself.
- Because create is idempotent by primary key and rides the same `lastMutationID` de-dup as every other mutation (ADR-0007), a retried push cannot create duplicates.

## Consequences

- **Full offline create/edit/label/lifecycle**: everything the user does offline is queued against a stable id and syncs on reconnect, with no id-remapping pass.
- **API contract change**: `POST /api/notes` (or the unified `/api/sync/push` `createNote` handler) now takes a client id instead of returning a fresh one. The old server-generated-id shape is retired for the create path; the response no longer needs to carry a new id.
- **UUID collision risk is negligible** (`crypto.randomUUID` v4), and `ON CONFLICT DO NOTHING` makes an accidental collision fail safe (no overwrite) rather than corrupt data. A create whose id already exists but is owned by *another* user must be rejected (permanent reject → ADR-0009), not silently swallowed — the handler checks owner on conflict.
- **DB schema**: `note.id` stays a UUID primary key; only its *source* moves from server default to client-supplied. Foreign keys (`note_doc`, `note_label`) are unaffected.
- Ordering of dependent mutations (create before rename/label of the same id) is preserved by the monotonic queue `seq` (ADR-0003) and replayed to the server in order (ADR-0007).
