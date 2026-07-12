# 23 · Instant, Lag-Free Notes — Implementation

## Status: code complete — awaiting flag flip + manual E2E

Design: [design.md](./design.md) · Decisions: [decisions.md](./decisions.md)

**One manual step remains:** set `NEXT_PUBLIC_SYNC_ENGINE=1` in `apps/web/.env` (documented in
`.env.example`; the file itself is guarded from tooling). Prod: set the same env var in the deploy.

## Goal State (from design)

1. `NEXT_PUBLIC_SYNC_ENGINE=1` — dashboard reads from Dexie, all metadata writes optimistic/instant.
2. Open/create is editable immediately; connection happens in the background.
3. Shared-note edit → socket bumps `metaVersion` + pokes owner+collaborators → pull refreshes card.
4. Private-note edit → `PUT /content` pokes owner → pull refreshes card (`metaVersion` already bumps).
5. Typing heading+body updates the card's title **and preview** within ~1s, no navigate/refresh.

## Work Items (TDD — test first, RED → GREEN)

- [x] **Socket, shared notes** (`apps/socket/src/metadata.ts`): `saveDerivedMetadata` now bumps
      `metaVersion` and calls `publishPokes(publisher, await loadNoteAudience(noteId))`; publisher
      threaded from `index.ts` (`buildRedisPublisher`, quit on destroy). Tests: `persistence.test.ts`
      asserts `metaVersion` increments and the owner is poked (injected fake publisher).
- [x] **API, private notes** (`apps/api/src/notes/router.ts` `PUT /content`): pokes the owner via
      `publishPokes(publisher, await loadNoteAudience(id))` after the write; publisher injected through
      `notesRouter(mw, publisher = redisPublisher)` and wired from `app.ts` (`syncDeps.publisher`).
      Test: `content.test.ts` asserts the owner is poked (injected fake).
- [~] **Web propagation test**: **skipped as redundant.** No web code change was needed — the
      poke→pull→rebuild→`useLiveQuery`→card path is already covered end-to-end by existing tests:
      `note-card.test.tsx` (renders `preview`), `pull.test.ts`/rebuild tests (a `metaVersion` delta
      re-materializes `db.notes`). The only new behavior (bump + poke) is tested on both server paths.
- [~] **Enable the flag**: `.env.example` documents `NEXT_PUBLIC_SYNC_ENGINE=1`; `apps/web/.env` is
      guarded from tooling, so the user sets it (see Status). No code change.
- [x] **Verification**: socket `bun test` 26/26, type-clean; api `bun test` 56 pass (the 2 fails are
      pre-existing `labels/` timeout flakes — pass with `--timeout 25000`, and labels routes are
      untouched); api + socket `check-types` clean; Biome clean on all changed files. No web code
      changed, so the web suite is unaffected.
- [ ] **Manual E2E** (after flag flip): log in, open a note over the dashboard, type a heading + body,
      confirm the card's title and preview update within ~1s without navigating. Repeat for a shared note.

## Out of Scope (see design)

- Shared-with-me list stays on TanStack Query (freshness unchanged).
- `ContentSync.onLocalDerive` zero-latency-while-typing enhancement — deferred (ADR-002).

## Session Notes

- Branch: `feat/instant-notes-sync` (created off `feat/editor-toolbar`, which carries unrelated
  uncommitted editor-toolbar work — not part of this spec).
- Root cause pinned before planning: CVR diff keys on `metaVersion` (`cvr.ts:177`); socket save never
  bumps it and neither content path pokes. Both reported bugs (stale dashboard, empty preview) reduce
  to this single propagation gap.
