# 8. Content lane: private-note REST persistence and private↔public single-writer handoff

Date: 2026-07-05

## Status

Accepted. Defines the content lane of ADR-0002.

## Context

Note bodies are a Yjs CRDT. Today the **only** writer of `note_doc.state` and the **only** deriver of `note.title`/`note.preview` is the socket app's Hocuspocus `onStoreDocument` (`apps/socket/src/persistence.ts`, `apps/socket/src/metadata.ts`). The local-first goal requires that a **private** note persist and derive its title/preview **without opening a socket** — while never letting two writers touch the same `note_doc` row at once, and while keeping title/preview **server-authoritative** (consistent with the socket path).

## Decision

Split content persistence by note state, with a strict **single-writer invariant** and a **shared derive helper**:

- **Private notes (no socket).** The editor's Yjs doc persists locally via `y-indexeddb` (`new IndexeddbPersistence(noteId, ydoc)`), giving instant, offline-durable edits. A debounced client task sends the **full** Yjs state (`Y.encodeStateAsUpdate`) to **`PUT /api/notes/:id/content`**. The server upserts `note_doc.state` (the same row Hocuspocus uses), derives `title`/`preview` via a **shared server helper** extracted from `onStoreDocument`, and bumps `note_meta.version` (ADR-0004) so the list updates via pull+poke.
- **Shared notes.** Unchanged — Hocuspocus owns the doc, persists it, and derives metadata exactly as today.
- **Single-writer invariant.** For any note at any instant, exactly one of {REST content path, Hocuspocus} writes `note_doc`. Private ⇒ REST only (socket not connected). Shared ⇒ Hocuspocus only (client stops REST-flushing).
- **Handoff private → public.** On `setShareLevel`/make-public: the client stops the REST flush, then connects Hocuspocus, which `loadDocState()`s the last REST-written blob and continues. Because both write the same `Y.encodeStateAsUpdate` full-state blob to the same row, the load is seamless.
- **Handoff public → private.** On make-private, Hocuspocus disconnects (existing revoke/kick path, ADR-0007); the owner's client resumes REST-flushing from its `y-indexeddb` state. Yjs being a CRDT, the local and last-server states converge.
- **Instant list title.** For zero-latency feedback the client *also* derives title/preview locally (via `@yapper/editor`'s existing extraction) and applies it as an optimistic metadata effect; the **server value remains authoritative** and overwrites on the next pull.

## Consequences

- **Private notes never open a WebSocket** — the original performance goal — yet still persist, sync cross-device (via the REST blob + metadata pull), and derive authoritative title/preview.
- **Derivation stays DRY and server-authoritative.** Title/preview logic moves into one helper called by both `onStoreDocument` and `PUT /content`; there is no "client sets title" trust hole (that option was explicitly rejected).
- **Full-blob writes** (not incremental updates) match the existing `note_doc` full-state storage, so no server-side Yjs merge runtime is added to the REST path. Cost: each flush sends the whole doc; acceptable for note-sized docs with debounce, revisit only if docs grow large.
- **The single-writer invariant is a correctness-critical constraint** and must be enforced at the transition: the client must not REST-flush a note while its Hocuspocus provider is connected, and must not connect Hocuspocus until flushing stops. A brief overlap is *tolerable* only because both write CRDT-convergent full-state blobs, but the design target is zero overlap.
- **`note_doc` now has two legitimate writers**; any future migration/locking on that table must account for both paths.
- Content durability offline is `y-indexeddb`'s responsibility; the REST flush is the server-sync step and is queued/retried like other network work when offline.
