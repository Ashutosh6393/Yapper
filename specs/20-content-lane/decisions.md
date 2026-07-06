# 20 · Content Lane — Decisions

The umbrella rationale is `docs/adr/0008-content-lane-private-rest-persistence-handoff.md` (and
ADR-0002). This file records only the **spec-local** choices spec 20 makes.

## ADR-001: Full-state blob over REST, not incremental Yjs updates

### Context

A private note must persist its body to the server without a socket. The wire could carry the full Yjs
state (`Y.encodeStateAsUpdate`) or incremental updates the server merges.

### Decision

`PUT /api/notes/:id/content` takes the **full** Yjs state (base64 in JSON), matching `note_doc`'s
existing full-state storage. The server upserts `note_doc.state` exactly as `saveDocState` does — no
server-side Yjs merge runtime on the REST path.

### Consequences

- No `Y.applyUpdate`-merge machinery or ordering/idempotency concerns added to the REST path (the server
  does decode the blob once to derive title/preview).
- Each flush sends the whole doc; base64-in-JSON adds ~33% over raw bytes. Debounce mitigates frequency;
  acceptable for note-sized docs. Octet-stream / incremental updates are future-work if docs grow large.

## ADR-002: `deriveNoteMetadata` in a new `@yapper/editor/collab` subpath

### Context

Title/preview derivation lives inline in the socket's `saveDerivedMetadata`. The REST path must derive
**identically** (server-authoritative, DRY). But `packages/editor/src/derive.ts` is deliberately
TipTap/Yjs/transformer-free so it runs standalone under Bun.

### Decision

Extract the derivation into `packages/editor/src/collab.ts`, exported from a **new subpath**
`@yapper/editor/collab`: `deriveNoteMetadata(doc: Y.Doc)` = `TiptapTransformer.fromYdoc(doc,
COLLAB_FIELD)` + `extractTitlePreview`. Both `saveDerivedMetadata` (socket) and `PUT /content` (api)
call it. `derive.ts` stays transformer-free behind `@yapper/editor/derive`.

### Consequences

- One source of truth for title/preview; the two persistence paths can't diverge (parity test guards it).
- **`apps/api` gains `@hocuspocus/transformer` + `yjs`** (to decode the blob + derive) — an accepted new
  dependency; the socket already has both.

## ADR-003: Single-writer enforced client-side; server tolerates brief overlap

### Context

REST (private) and Hocuspocus (shared) both write `note_doc`. Two simultaneous writers must be avoided.

### Decision

Enforce the single-writer invariant **in the client controller** (private ⇒ REST only, no provider;
shared ⇒ provider only, no flush; sequence handoff teardown → setup). `PUT /content` gates on
`resolvePerm === "edit"` but does **not** reject merely because a note is currently shared — a brief
server-tolerated overlap is safe because both paths write CRDT-convergent full-state blobs.

### Consequences

- Zero-overlap is the design target and is asserted by tests; a momentary overlap can't corrupt data
  (CRDT convergence), but is not the intended state.
- The **owner is not kicked** on make-private, so the owner's controller must self-drive the
  public→private handoff (tear down its provider, resume REST) — the one handoff the socket can't drive.

## ADR-004: `meta_version` canonical name; column owned by spec 16

### Context

ADR-0008 referred to `note_meta.version`; the engine's canonical name (brief, specs 14/16/19) is
`note.meta_version`.

### Decision

Use `note.meta_version`. Spec 20 **bumps** it on every successful `PUT /content`; the **column** is added
by spec 16 (spec 20 builds last, so it exists by then). Spec 20 does not add the column or the pull.

### Consequences

- The content lane and metadata lane meet at exactly this bump — it's what lets a derived title reach
  other devices' lists via the CVR pull + poke.
- A build/order dependency on spec 16 (and 19) is explicit.

## ADR-005: One ydoc per note with `y-indexeddb` always attached; swap only the writer

### Context

The handoff between REST and Hocuspocus must not lose content.

### Decision

Keep a **single `Y.Doc` per note** with `IndexeddbPersistence(noteId, ydoc)` always attached (local
durability). Handoff swaps only the **sync writer** on that same doc: private→public stops the flush and
attaches a provider (which `loadDocState`s the server blob into the doc); public→private detaches the
provider and resumes the flush.

### Consequences

- Because `note_doc` holds the last full-state blob and Yjs is a CRDT, the states converge on load — no
  content lost across the switch.
- Local edits are offline-durable regardless of which writer is active (the `'synced'` event gates the
  first flush).
