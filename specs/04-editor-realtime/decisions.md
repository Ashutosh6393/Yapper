# 04 · Editor & Realtime — Decisions

## ADR-001: Shared `@yapper/editor` schema for server-side derivation
### Context
Title/preview are derived from the doc and written by `socket` — the server must parse the same schema as web.
### Decision
Put the TipTap schema/extensions + a pure `extractTitlePreview` in `@yapper/editor`, importable by both
web (editor config) and socket (Bun, no React) for derivation.
### Consequences
- Schema changes happen in one place; derivation path must stay React/DOM-free to run under Bun.

## ADR-002: Full-state snapshot persistence via extension-database
### Context
Need durable Yjs state without operating a compaction job.
### Decision
Store a single full-state blob (`Y.encodeStateAsUpdate`) per note in `note_doc`, overwritten on a ~2s
debounced `onStoreDocument` (`@hocuspocus/extension-database` fetch/store).
### Consequences
- Simple load (one read + applyUpdate); write amplification per save accepted. History deferred.

## ADR-003: Owner-only connections this slice
### Context
Sharing/permissions land in slice 06; cursors need multiple users (05).
### Decision
`onAuthenticate` rejects non-owners now; structured to swap in `@yapper/permissions` later.
### Consequences
- 04 is testable with one identity (two tabs) before sharing exists.
