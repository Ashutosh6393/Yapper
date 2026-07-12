# 23 · Instant, Lag-Free Notes — Design

Make every note interaction — create, open, edit, archive, trash, label, change settings, view — feel
**instant**, with no waiting on the network, and make an edit's new **title and preview** show up on the
dashboard **immediately**.

The lag-free architecture already exists: the local-first sync engine built across specs **14–21**
(Dexie materialized store, client-minted ids, named mutators, CVR delta pull, SSE poke, content lane).
It is **complete and tested but gated OFF** behind `NEXT_PUBLIC_SYNC_ENGINE` (default off, including
prod). Today's prod runs the fallback TanStack Query path, which round-trips the network on every action
— that is the lag the user reports.

This spec does **not** design a new architecture. It (1) **turns the engine on** and (2) closes the
**two metadata-propagation gaps** that make a content edit's derived title/preview invisible to the
dashboard. No new dependencies.

## The two bugs, root-caused

Both reported bugs — "editing a note doesn't update the dashboard" and "the card shows only the heading,
no preview text" — are the **same root cause**: after a content edit, the freshly-derived
`title`/`preview` never reach the dashboard's note list. The card keeps showing its stale create-time
snapshot (`title: "Untitled"`, `preview: ""`).

The dashboard (engine path) surfaces a note only when its `metaVersion` increases — the CVR diff
(`apps/api/src/sync/cvr.ts:177`, `n.metaVersion > prior`). Tracing the two content-write paths against
that invariant:

| Write path | Bumps `metaVersion`? | Publishes a poke? | Effect on dashboard |
|---|---|---|---|
| **Shared note** — socket `saveDerivedMetadata` (`apps/socket/src/metadata.ts:14`) | **No** — sets only title/preview/updatedAt | **No** — socket is not a poke publisher | New title/preview **never** surface (CVR can't see them) |
| **Private note** — REST `PUT /content` (`apps/api/src/notes/router.ts:459`) | Yes | **No** | Change is visible to a pull, but no pull is triggered until a window-focus backstop fires |

Pokes are targeted **per-user** (`poke:user:{userId}`, `apps/api/src/sync/stream.ts`), so a single poke
after a content write reaches every one of that user's tabs — including the one holding the editor
open over the dashboard. No same-tab-specific plumbing is needed.

## Goal State (acceptance)

1. **Engine on.** `NEXT_PUBLIC_SYNC_ENGINE=1`. Dashboard reads come from Dexie via `useLiveQuery`;
   every metadata write (create / archive / unarchive / trash / restore / delete-forever / label /
   share-level / make-private) is optimistic and instant. First load bootstraps Dexie via a full CVR
   pull. No spinner on subsequent loads.
2. **Instant open/create.** Creating or opening a note is editable immediately; the socket/REST
   connection is established in the background (`assumeEditable` + content lane, already built).
3. **Shared-note edits propagate.** After an edit to a `view`/`edit` note, the socket save bumps
   `metaVersion` and publishes a poke to the note's owner + active collaborators; a coalesced pull
   then delivers the fresh **title and preview** to every open dashboard.
4. **Private-note edits propagate.** After a `PUT /content` flush, the API publishes a poke to the
   owner; the coalesced pull delivers fresh title and preview. (`metaVersion` already bumps here.)
5. **End-to-end freshness.** With the editor open over the dashboard, typing a heading + body updates
   the underlying note card's title and preview within ~1s of stopping, without navigating or
   refreshing.

## Scope

**In:**
- `NEXT_PUBLIC_SYNC_ENGINE=1` (env / `.env` docs).
- `apps/socket/src/metadata.ts` — bump `metaVersion` in `saveDerivedMetadata` **and** publish a poke to
  owner + active collaborators.
- `apps/api/src/notes/router.ts` — publish a poke after the `PUT /content` write.
- **No `packages/permissions` changes.** The publisher already exists and is reused as-is:
  `publishPokes(publisher, userIds)` + `loadNoteAudience(db, noteId)` (owner + active collaborators,
  deduped, null-Redis-tolerant) — the same helpers the API push path calls (`apps/api/src/sync/push.ts:145`).
- Goal-state tests first (TDD) in `apps/socket/src/persistence.test.ts`, `apps/api/src/notes/content.test.ts`,
  and a new web test asserting a poke→pull refreshes the card's title **and** preview.

**Out / unchanged:**
- **Shared-with-me** list stays on TanStack Query in both flag states (per `apps/web/lib/sync/reads.ts`);
  its freshness is **not regressed** but also not improved here — deferred.
- The optional **zero-latency-while-typing** enhancement (wiring `ContentSync.onLocalDerive` so the
  card updates before any round-trip) is **deferred** to a fast-follow; the ~1s poke→pull refresh from
  goals 3–4 is expected to be sufficient. See decisions ADR-002.
- No offline-conflict UI beyond spec 21. No new dependencies. No changes to the mutator set,
  push/pull protocol, or Zod contracts.

## Risks

- **Enabling the engine app-wide** exposes the Dexie/pull/push/poke path to all users for the first
  time. Mitigation: it is fully unit-tested (specs 14–21); the first-load bootstrap is a full CVR
  `reset` pull; a fast rollback exists (flip the flag off → byte-for-byte the old Query path).
- **Pokes require Redis** (Upstash, already configured). Without `REDIS_URL` the poke is a no-op and
  the dashboard refreshes only on the focus/visibility/online backstops (`apps/web/lib/sync/poke.ts`)
  — degraded but not broken.
- **Direct-write optimism (deferred):** if goals 3–4's ~1s refresh feels slow, ADR-002's
  `onLocalDerive` path is the upgrade; it writes title/preview to local Dexie and self-heals on the
  next rebuild.
