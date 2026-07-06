# 2. Local-first sync engine for note metadata, two lanes

Date: 2026-07-05

## Status

Accepted

Supersedes the "TanStack Query owns notes server state" model (`apps/web/lib/queries/notes.ts`) and the spec-13 optimistic layer (`apps/web/lib/queries/optimistic.ts`) **for note metadata**. Umbrella decision; the detailed mechanics are recorded in ADR-0003 … ADR-0009, which all follow from this one.

## Context

The dashboard/editor UI is laggy and inconsistent (`docs/rendering-optimization.md`). The symptoms: refetch-on-tab-switch spam, spinners on navigation, and create/mutation latency. The doc proposed a "global state single source of truth" plus "don't open a socket for private notes, buffer content in localStorage."

Two facts from the codebase reframe that proposal:

1. **The socket is the *only* thing that persists content.** Note bodies are a Yjs CRDT; the sole writer of `note_doc.state` — and the sole deriver of `note.title`/`note.preview` — is the socket app's Hocuspocus `onStoreDocument` (`apps/socket/src/persistence.ts`, `apps/socket/src/metadata.ts`). `POST /api/notes` only inserts an `Untitled`/`private` row (`apps/api/src/notes/router.ts`). There is **no REST path for content.** So "no socket for private notes" as written means private notes never persist — private is the default and majority case. The real requirement is **decoupling persistence from realtime**, not skipping the socket.

2. **A client cache already exists.** TanStack Query + spec-13 already give optimistic create/archive/trash/restore/delete. What's missing versus a true "instant, in-sync" app is a *durable local source of truth*, offline capability, and precise cross-device/collaborator propagation — not another in-memory cache.

The chosen direction (explicitly build-to-learn, accepting multi-week scope) is a **local-first architecture** modelled on Replicache/Linear: a durable local store is the source of truth the UI reads from, every write is applied locally first and queued, and a background engine reconciles with the server via pushed mutations and pulled deltas. Because Yapper's **permissions are server-authoritative and security-critical**, the engine can never be "client wins" — every optimistic mutation must be reversible when the server rejects it.

## Decision

Build a hand-rolled local-first sync engine for **note metadata**, split into **two lanes** that meet only at the note record:

- **Metadata lane (new engine).** The note list, `title`/`preview`, lifecycle state (active/archived/trashed), labels, and share/access level flow through the engine. The client reads from a local IndexedDB store (Dexie); a mutation queue + pusher + CVR puller reconcile with `apps/api`. Details in ADR-0003 (local store + optimistic model), ADR-0004 (CVR pull), ADR-0007 (mutations), ADR-0009 (rollback UX).
- **Content lane (keep Yjs).** Note bodies stay a Yjs CRDT — we do **not** reinvent concurrent rich-text merge. Local durability comes from `y-indexeddb`. Private notes flush full Yjs state to a new REST endpoint; shared notes use Hocuspocus unchanged. Details in ADR-0008.

The lanes meet at exactly one point: whichever server path persists content (REST for private, Hocuspocus for shared) derives `title`/`preview` via a **shared server helper** and bumps the note's metadata version, so the change flows to the list through the metadata lane's CVR pull + poke.

Hand-rolled (not Replicache/Zero/Electric) because the goal is to learn the engine and because an off-the-shelf framework would overlap the existing Yjs/Better-Auth/Drizzle stack. We borrow the Replicache *model*, not the library.

## Consequences

- **TanStack Query is removed from the notes path.** `useNotes`/`useSharedNotes`/`useNote` and the spec-13 `optimistic.ts` are retired in favour of Dexie `useLiveQuery` selectors + engine mutations. This intentionally reinterprets the `apps/web` CLAUDE.md rule "Query owns server state"; that rule should be updated to "the sync engine owns notes; Query may remain for incidental, non-local-first reads." Auth/session still use Better Auth as-is.
- **Scope is large and staged.** This is not a small diff. Suggested slice order (each independently shippable behind a flag):
  1. Dexie schema + hydrate + read path (list/single render from `db.notes` via `useLiveQuery`), server still authoritative via a one-shot pull.
  2. Mutation queue + local named mutators + `rebuild()` (optimistic writes, no server yet).
  3. Pusher + `/api/sync/push` + server mutators + `lastMutationID` (idempotent apply).
  4. CVR puller + `/api/sync/pull` + `note_meta.version` + CVR table (deltas incl. removals).
  5. SSE poke (`/api/sync/stream`) + Redis fanout; pull-on-focus/reconnect backstop.
  6. Content lane: `PUT /api/notes/:id/content` + shared derive helper + private↔public handoff.
  7. Offline hardening (client-minted IDs end-to-end, queue durability, reconnect).
  8. Delete the retired Query/optimistic notes code.
- **Two persistence writers to `note_doc`** (REST for private, Hocuspocus for shared) — safe only under the single-writer invariant in ADR-0008.
- **New backend surface**: a sync router (`push`/`pull`/`stream`), a CVR table, per-note metadata versioning, and per-client mutation tracking. The existing revoke/role Redis channels and permission derivation (`@yapper/permissions`) are reused, not replaced.
- **Realtime co-editing is unchanged.** Live cursors/presence and the "made private" kick remain a Hocuspocus concern (ADR-0001-era socket behavior); the engine is orthogonal to it.
- **Reversible-by-design.** If the engine proves too costly, lanes can be abandoned independently: the content lane collapses back to "always use Hocuspocus," and the metadata lane back to Query — because we kept them separate.
