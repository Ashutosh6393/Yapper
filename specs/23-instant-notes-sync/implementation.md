# 23 · Instant, Lag-Free Notes — Implementation

## Status: planned — not started

Design: [design.md](./design.md) · Decisions: [decisions.md](./decisions.md)

## Goal State (from design)

1. `NEXT_PUBLIC_SYNC_ENGINE=1` — dashboard reads from Dexie, all metadata writes optimistic/instant.
2. Open/create is editable immediately; connection happens in the background.
3. Shared-note edit → socket bumps `metaVersion` + pokes owner+collaborators → pull refreshes card.
4. Private-note edit → `PUT /content` pokes owner → pull refreshes card (`metaVersion` already bumps).
5. Typing heading+body updates the card's title **and preview** within ~1s, no navigate/refresh.

## Work Items (TDD — test first, RED → GREEN)

- [ ] **Socket, shared notes** (`apps/socket/src/metadata.ts`): `saveDerivedMetadata` also bumps
      `metaVersion` and calls `publishPokes(publisher, await loadNoteAudience(db, noteId))`. Thread the
      Redis publisher in from the socket wiring. Test: extend `persistence.test.ts` to assert
      `metaVersion` increments on save (and preview persists — regression guard for bug #2).
- [ ] **API, private notes** (`apps/api/src/notes/router.ts` `PUT /content`): after the metadata
      update, `publishPokes(redisPublisher, await loadNoteAudience(db, id))`. Test: extend
      `content.test.ts` to assert a poke is published to the owner.
- [ ] **Web propagation test**: with the engine flag on, a simulated `poke → pull` re-materializes a
      note whose `metaVersion` grew, and the dashboard card renders the updated **title and preview**.
- [ ] **Enable the flag**: set `NEXT_PUBLIC_SYNC_ENGINE=1` (`apps/web/.env` + `.env.example` note).
- [ ] **Verification**: `bun test` in `apps/socket`, `apps/api`, and web (`bunx vitest run --maxWorkers=1`,
      per memory `web-vitest-oom`); `bun run check-types` in each touched app; Biome clean.
- [ ] **Manual E2E**: log in, open a note over the dashboard, type a heading + body, confirm the card's
      title and preview update within ~1s without navigating. Repeat for a shared note.

## Out of Scope (see design)

- Shared-with-me list stays on TanStack Query (freshness unchanged).
- `ContentSync.onLocalDerive` zero-latency-while-typing enhancement — deferred (ADR-002).

## Session Notes

- Branch: `feat/instant-notes-sync` (created off `feat/editor-toolbar`, which carries unrelated
  uncommitted editor-toolbar work — not part of this spec).
- Root cause pinned before planning: CVR diff keys on `metaVersion` (`cvr.ts:177`); socket save never
  bumps it and neither content path pokes. Both reported bugs (stale dashboard, empty preview) reduce
  to this single propagation gap.
