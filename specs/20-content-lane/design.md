# 20 · Content Lane — Design

The metadata lane (specs 14–19) makes the note *list* local-first. This spec builds the engine's other
half — the **content lane** (ADR-0008): how a note *body* persists. Today the **only** writer of
`note_doc.state`, and the **only** deriver of `note.title`/`note.preview`, is the socket app's
Hocuspocus `onStoreDocument` (`apps/socket/src/persistence.ts` + `apps/socket/src/metadata.ts`). That
means a note only persists while a WebSocket is open — including **private** notes, which are the
default and majority case. The local-first goal requires a private note to persist and derive its
title/preview **without opening a socket**, while never letting two writers touch the same `note_doc`
row, and while keeping title/preview **server-authoritative** (identical to the socket path).

This spec keeps note bodies as a Yjs CRDT (we do not reinvent rich-text merge). It adds three things:
(1) `y-indexeddb` in the editor for instant, offline-durable local content; (2) a REST endpoint
`PUT /api/notes/:id/content` that private notes debounce-flush the full Yjs state to, which upserts the
same `note_doc` row Hocuspocus uses, derives title/preview via a **shared server helper** extracted
from the socket, and bumps `note.meta_version` (specs 16/19) so the change flows to the list; and (3) a
**single-writer** content-sync controller in `Editor.tsx` that runs exactly one writer per note — REST
for private, Hocuspocus for shared — and hands off cleanly in both directions when the access level
changes. Everything is behind `NEXT_PUBLIC_SYNC_ENGINE`; with the flag off, every note uses Hocuspocus
exactly as today. This is spec **20** of the engine (ADR-0008); by build order it ships **last**
(14 → 15 → 18 → 19 → 16 → 21 → 17 → **20**) because it depends on the metadata lane it feeds.

## Goal State (acceptance)

**Private-note REST persistence**
1. `PUT /api/notes/:id/content` exists in `apps/api/src/notes/router.ts`, behind `requireAuth`. Its
   body is the note's **full** Yjs state (`Y.encodeStateAsUpdate`, base64 in JSON — see *Endpoint*),
   validated by a shared `putNoteContentBodySchema` in `@yapper/schemas`. It **upserts**
   `note_doc.state` for `:id` (the same row Hocuspocus writes), derives `title`/`preview` from the
   decoded doc via the **shared helper**, writes them onto `note`, and bumps `note.meta_version`.
2. A **private** note persists and re-derives its title **without any socket connection**: after a
   `PUT /content` for a doc whose first block is `"Hello world"`, `note_doc.state` holds the blob and
   `note.title === "Hello world"` — proven by an api goal-state test that never opens Hocuspocus.
3. The endpoint is **server-authoritative on permission and derivation**: it gates with
   `resolvePerm(id, userId) === "edit"` (reuse `@yapper/permissions`, cache-first like the socket);
   `none`/`view` → 403, unknown note → 404, malformed body → 400. The client never supplies
   `title`/`preview` — the server derives them from the doc (no "client sets title" trust hole).
4. `note.meta_version` is bumped on every successful `PUT /content`, so the CVR puller (spec 16)
   surfaces the new title/preview to every device's list via pull + poke. The bump reuses the same
   central invariant every authoritative metadata write uses (spec 16/19).

**Shared derive helper (DRY, extracted from the socket)**
5. Title/preview derivation lives in **one** helper, `deriveNoteMetadata`, in `@yapper/editor`
   (new server subpath — see *Shared helper*). It takes a `Y.Doc` and returns `{ title, preview }` via
   `TiptapTransformer.fromYdoc(doc, COLLAB_FIELD)` + the existing `extractTitlePreview`. Both
   `apps/socket/src/metadata.ts` (`saveDerivedMetadata`) and the new `PUT /content` handler call it, so
   the two persistence paths derive **identically**. A parity test asserts both paths yield the same
   `{ title, preview }` for the same doc.
6. `apps/socket/src/metadata.ts` is refactored to call `deriveNoteMetadata` (no behavior change); the
   existing socket metadata test stays green (regression guard).

**Editor: y-indexeddb + single-writer content-sync**
7. The editor attaches `new IndexeddbPersistence(noteId, ydoc)` (from `y-indexeddb`) to the note's
   `Y.Doc`, giving instant, **offline-durable** local content; it awaits the `'synced'` event before
   first flush and calls `destroy()` on unmount. The `y-indexeddb` doc name is the canonical note
   `id` (same id that keys `db.base`/`db.notes`, the CVR, and `note_doc.note_id` — spec 18).
8. **Single-writer invariant.** For any note at any instant, exactly one writer touches `note_doc`:
   a **private** note (access `private`) flushes via REST only and **does not open Hocuspocus**; a
   **shared** note (access `view`/`edit`) uses Hocuspocus only and **does not REST-flush**. A test on
   the content-sync controller proves: access `private` ⇒ debounced `PUT /content` fires and no
   provider is created; access `view`/`edit` ⇒ a provider is created and no `PUT /content` fires.
9. **Offline durability.** With the network down (flush `fetch` rejecting), an edit to a private note
   still persists locally: `IndexeddbPersistence` reaches `'synced'` and the doc is restored on reload
   with no successful server write; the flush is queued/retried like other network work (it does not
   throw into the editor). Proven by a web test with a failing `fetch` and `fake-indexeddb`.

**Handoff (both directions preserve single-writer)**
10. **private → public** (owner shares the note, `setShareLevel`): the controller **stops the REST
    flush first**, then connects Hocuspocus, which `loadDocState()`s the last REST-written blob into
    the same `Y.Doc`. Because both writers persist the same `Y.encodeStateAsUpdate` full-state blob to
    the same row, the load is seamless (CRDT-convergent). No REST flush occurs while the provider is
    connected.
11. **public → private** (owner makes the note private, `makePrivate`): Hocuspocus disconnects. Non-owner
    clients are kicked by the existing revoke path (ADR-0007, unchanged). The **owner is not kicked**
    (owners never are), so the owner's controller **proactively tears down its own provider** on
    observing the access→`private` change, then **resumes REST-flushing** from its `y-indexeddb` state.
    A test proves exactly one writer is active before and after each transition (zero-overlap target).
12. **Instant list title (optimistic).** On a private flush the client **also** derives `title`/`preview`
    locally via `@yapper/editor`'s `extractTitlePreview` and applies it as an **optimistic metadata
    effect** (the mechanism is spec 19's local mutators / `rebuild()`), so the dashboard card updates
    with zero latency. The **server value stays authoritative** and overwrites the optimistic value on
    the next pull (spec 16).

**Cross-cutting**
13. Everything is behind `isSyncEngineEnabled()`. With the flag **off**, `Editor.tsx` is byte-for-byte
    today's behavior — every note (private included) uses Hocuspocus, no `y-indexeddb`, no REST flush.
    `PUT /content` may exist server-side but is exercised only by flag-on clients. `tsc --noEmit` clean
    (`apps/web`, `apps/api`, `apps/socket`, `packages/editor`, `packages/schemas`); Biome clean; no
    `as any`. Goal-state tests written first (TDD) and green.

## Scope

**In:**
- `apps/api/src/notes/router.ts` — new `PUT /api/notes/:id/content` handler (upsert `note_doc.state` +
  shared-helper derive + `note.meta_version` bump + edit-permission gate) and its route test.
- `packages/schemas/src/note.ts` (or `content.ts`) — `putNoteContentBodySchema` + inferred type,
  re-exported from the barrel; imported by web (flush) and api (validation).
- `packages/editor` — new server subpath `@yapper/editor/collab` exporting
  `deriveNoteMetadata(doc: Y.Doc): { title; preview }` (transform + `extractTitlePreview`), plus its
  parity test.
- `apps/socket/src/metadata.ts` — refactor `saveDerivedMetadata` to call `deriveNoteMetadata`
  (no behavior change).
- `apps/web/app/notes/[id]/Editor.tsx` (+ a small content-sync controller module under
  `apps/web/lib/sync/`) — `y-indexeddb` wiring, the debounced private REST flush, the single-writer
  content-sync controller, and the two-direction handoff. Behind the flag.
- Add `y-indexeddb` to `apps/web`; add `yjs` + `@hocuspocus/transformer` to `packages/editor`'s server
  subpath deps (already the socket's deps — see *Shared helper* for the cost note).
- The written single-writer + handoff design (this doc).

**Out (see the named sibling spec / future-work.md):**
- `note.meta_version` **column**, the CVR puller, `/api/sync/pull`, `sync_cvr` — **spec 16**
  (cvr-delta-pull). Spec 20 *bumps* the column and *relies on* the pull to propagate; it does not add
  them.
- The Dexie store, `db.notes`/`db.base`, `useLiveQuery`, `rebuild()` replay — **spec 15**.
- Named client/server **mutators** (incl. `setShareLevel`/`makePrivate`) and the **optimistic metadata
  effect** the local title derive feeds — **spec 19** (named-mutators). Spec 20 *calls* the effect; it
  does not define the mutators.
- Client-minted note ids end-to-end (the id the `y-indexeddb` doc name uses) — **spec 18**.
- SSE poke transport that nudges the pull — **spec 17**.
- Rollback UX (transient vs permanent classification of a failed flush) — **spec 21**. The flush queues
  and retries; permanent-reject semantics for content are noted as future-work.
- **Realtime co-editing** (Hocuspocus cursors/presence, the made-private kick) — untouched and
  orthogonal (ADR-0001-era socket behavior). This spec only decides *when* the provider is attached,
  not how it renders presence.

---

## Endpoint — `PUT /api/notes/:id/content`

New route in `apps/api/src/notes/router.ts`, gated by the router's `requireAuth` and the `authed()`
wrapper (same as every other note route). Contract in `@yapper/schemas`:

```ts
// packages/schemas/src/note.ts (or content.ts), re-exported from index.ts
export const putNoteContentBodySchema = z.object({
  state: z.string(), // base64(Y.encodeStateAsUpdate(ydoc)) — full CRDT state blob
});
export type PutNoteContentBody = z.infer<typeof putNoteContentBodySchema>;
```

Handler flow (mirrors the existing owner-gated routes' structure — parse, gate, mutate):

```
PUT /api/notes/:id/content
  1. parse body with putNoteContentBodySchema → 400 on failure
  2. if resolvePerm(id, userId) !== "edit" → 403 (also covers 404-as-none for unknown notes)
  3. state = Buffer.from(body.state, "base64")
  4. saveDocState(id, state)                    // reuse apps/socket path's upsert semantics
  5. doc = new Y.Doc(); Y.applyUpdate(doc, state)
     { title, preview } = deriveNoteMetadata(doc)   // SHARED helper — same as onStoreDocument
  6. db.update(note).set({ title, preview, updatedAt: now, metaVersion: sql`meta_version + 1` })
  7. 204
```

Notes:
- **Same row as Hocuspocus.** Step 4 upserts `note_doc` exactly as `apps/socket/src/persistence.ts`
  `saveDocState` does (`onConflictDoUpdate` on `noteDoc.noteId`). The api gains the `noteDoc` import;
  the upsert logic is small enough to inline here or lift into a tiny shared db helper (author's choice
  — recorded in decisions.md).
- **Permission gate, not owner-check.** Gate on `edit` permission via `resolvePerm` (the cache-first
  `@yapper/permissions` derivation the socket uses), so the two content paths agree on who may write.
  For a *private* note only the owner resolves to `edit`, which is the intended single writer. The
  server does **not** reject a PUT merely because the note is currently shared — the single-writer
  invariant is enforced **client-side** (goal #8); a brief server-tolerated overlap is safe because
  both paths write CRDT-convergent full-state blobs (ADR-0008 consequence).
- **`meta_version` bump** uses the central invariant (spec 16 owns the column; ADR-0008 refers to it as
  `note_meta.version` — the canonical engine name is `note.meta_version`, see decisions.md). The bump
  is what lets the list update via the metadata lane's pull + poke; the content lane and metadata lane
  meet at exactly this point (ADR-0002).

## Shared helper — `@yapper/editor/collab` · `deriveNoteMetadata`

Today `apps/socket/src/metadata.ts` does the derivation inline:

```ts
const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
const { title, preview } = extractTitlePreview(json);
```

Extract this into `packages/editor/src/collab.ts`, exported from a new subpath `@yapper/editor/collab`:

```ts
// @yapper/editor/collab
import { TiptapTransformer } from "@hocuspocus/transformer";
import type * as Y from "yjs";
import { COLLAB_FIELD, extractTitlePreview } from "./derive";

/** Derive server-authoritative { title, preview } from a note's Yjs doc. Single source for both the
 *  socket's onStoreDocument and the REST PUT /content path (ADR-0008). */
export function deriveNoteMetadata(doc: Y.Doc): { title: string; preview: string } {
  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  const { title, preview } = extractTitlePreview(json);
  return { title, preview };
}
```

- **Why a new subpath, not `./derive`.** `derive.ts` is deliberately TipTap/Yjs/transformer-free so it
  runs standalone under Bun (`@yapper/editor/derive`, used by the pure text extraction). `collab.ts`
  pulls `@hocuspocus/transformer` + `yjs`, so it lives behind its own subpath; callers that only need
  plain-text extraction keep importing `@yapper/editor/derive`. The socket already depends on both
  packages; **`apps/api` gains them** to decode the blob and derive — an accepted cost (see Risks).
- `saveDerivedMetadata` becomes `const { title, preview } = deriveNoteMetadata(doc); await db.update(...)`.

## Editor — y-indexeddb + single-writer content-sync

The current `Editor.tsx` always opens a `HocuspocusProvider` (`provider.document` is the note's
`Y.Doc`) regardless of access level — so even private notes persist via the socket today. Behind the
flag, split content sync by note state around **one `Y.Doc` per note** that is always locally durable:

```
one ydoc per note
  └─ IndexeddbPersistence(noteId, ydoc)   ← always attached (local durability, offline-safe)
  └─ exactly one sync writer, chosen by access level:
       private (access "private")  → debounced PUT /api/notes/:id/content   (no provider)
       shared  (access "view"|"edit") → HocuspocusProvider(ydoc)            (no REST flush)
```

- **Private path.** No `HocuspocusProvider`. A debounced task encodes `Y.encodeStateAsUpdate(ydoc)`,
  base64s it, and `PUT`s it to `/content`; on `ydoc.on("update", …)` it (re)schedules the flush. It
  also derives `{ title, preview }` locally and applies the optimistic metadata effect (spec 19).
- **Shared path.** Unchanged from today: `HocuspocusProvider` bound to the ydoc, `CollaborationCaret`,
  identity/permission/kick handling. Hocuspocus owns persistence and derivation.
- **The handoff is "swap the writer on the same ydoc."** Keeping a single ydoc (with `y-indexeddb`
  attached) means private→public merely stops the flush and attaches a provider (which `loadDocState`s
  the server blob into that doc), and public→private detaches the provider and resumes the flush.
  Because `note_doc` already holds the last full-state blob from whichever writer was active, and Yjs
  is a CRDT, the two states converge on load — no content is lost across the switch.
- **Owner-side public→private trigger.** The existing revoke/kick (ADR-0007) disconnects *non-owner*
  clients; the **owner is never kicked**. So the owner's controller must itself react to the
  access→`private` transition (observed from the note's access level — `db.notes` via `useLiveQuery`
  (spec 15), or the local `makePrivate` mutation) by tearing down its own provider and resuming REST.
  This is the one handoff the socket cannot drive for us.

The controller is best factored as a small module (e.g. `apps/web/lib/sync/content-sync.ts`) that
`Editor.tsx` drives with `(noteId, accessLevel)`; it owns the ydoc, the `IndexeddbPersistence`, the
debounce timer, and the single active writer, and exposes teardown for unmount. Keep the flag-off path
untouched: when `isSyncEngineEnabled()` is false, `Editor.tsx` takes today's Hocuspocus-always branch.

## TDD — failing goal-state tests to write first

Write these red, then implement to green. Run api/socket/editor with `bun test` from each app/package
dir; run web with `bunx vitest run --maxWorkers=1` from `apps/web` (see CLAUDE.md gotchas).

**api — `apps/api/src/notes/router.test.ts` (supertest, real Neon):**
1. `PUT /api/notes/:id/content` with a base64 Yjs state whose first block is `"Hello world"`:
   asserts (a) `note_doc.state` row exists/updated for the id, (b) `note.title === "Hello world"` and
   `note.preview` matches `extractTitlePreview`, (c) `note.meta_version` strictly increased. Proves
   **private persistence + server derive without a socket** (goal #2, #4).
2. Permission/validation: a `view`-only collaborator → 403; unknown id → 403/404; malformed body
   (missing/non-base64 `state`) → 400 (goal #3).
3. Second PUT of a newer blob updates `note_doc.state` and bumps `meta_version` again (upsert, not
   duplicate row).

**packages/editor — `src/collab.test.ts` (bun test):**
4. `deriveNoteMetadata(doc)` for a known doc returns the same `{ title, preview }` the socket path
   produces (parity with `extractTitlePreview` over `TiptapTransformer.fromYdoc`) — proves the two
   persistence paths derive **identically** (goal #5).

**apps/socket — existing `metadata`/`persistence` tests (bun test):**
5. The existing derived-metadata test stays green after `saveDerivedMetadata` is refactored onto
   `deriveNoteMetadata` (regression guard, goal #6).

**apps/web — content-sync controller test (vitest + `fake-indexeddb` + mocked `fetch`/provider):**
6. **Single-writer**: access `private` ⇒ a debounced `PUT /content` is issued and **no**
   `HocuspocusProvider` is constructed; access `view`/`edit` ⇒ a provider is constructed and **no**
   `PUT /content` is issued (goal #8).
7. **Handoff both directions**: private→public stops the flush **before** the provider connects;
   public→private tears down the provider **before** the flush resumes; at every instant exactly one
   writer is active (goal #10, #11).
8. **Offline durability**: with `fetch` rejecting, an edit still reaches `IndexeddbPersistence`
   `'synced'` and reloading the ydoc restores the content with no successful server write; the flush is
   retried, not thrown (goal #9).

A slice is done only when these are green + `tsc --noEmit` clean (all touched packages) + Biome clean.

## Dependencies & build order

Spec numbers follow the ADRs (20 ↔ 0008); the **build** order differs. Per the engine graph, spec 20
depends on **14, 15, 16, 19** and is built **last**:
**14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.**

- **14 (sync-foundations)** — the `NEXT_PUBLIC_SYNC_ENGINE` flag + `@yapper/schemas` sync package this
  spec's flag-gating and `putNoteContentBodySchema` slot into.
- **15 (dexie-local-store)** — `db.notes`/`useLiveQuery`, so the controller can observe a note's access
  level and drive the public→private handoff.
- **16 (cvr-delta-pull)** — owns `note.meta_version` (the column this spec **bumps**) and the pull that
  turns the bump into a list update. Without 16 the derive persists but never reaches other devices'
  lists.
- **19 (named-mutators)** — owns `setShareLevel`/`makePrivate` (the access transitions that trigger
  handoff) and the **optimistic metadata effect** the local title-derive feeds (goal #12).
- **18 (client-minted-ids)** — the note `id` used as the `y-indexeddb` doc name and `note_doc.note_id`.
- **17 (sse-poke)** is not a hard dependency (a focus/reconnect pull is the backstop), but in the
  recommended sequence it ships before 20, so cross-device content propagation is instant by then.

Ships **last** and behind the flag, so nothing here affects prod until the whole sequence is green and
the flag flips (spec 14's flag-flip criteria include "the content lane persists private notes and
re-derives title/preview").

## Cross-cutting rules
- **Everything behind `isSyncEngineEnabled()`.** Flag off ⇒ every note (private included) uses
  Hocuspocus as today; no `y-indexeddb`, no REST flush. Only `flag.ts` reads the env var.
- **Contracts in `@yapper/schemas`** (`putNoteContentBodySchema` + type), imported by web (flush) and
  api (validation). Never duplicate the shape per app. Derive types with `z.infer`.
- **Derivation is DRY and server-authoritative.** One `deriveNoteMetadata` helper feeds both
  persistence paths; the client-side derive is **optimistic only** (instant list feedback) and is
  overwritten by the server value on the next pull. The client never writes `title`/`preview` to the
  server.
- **Permissions stay server-authoritative** — `PUT /content` gates on `resolvePerm === "edit"` (reuse
  `@yapper/permissions`, cache-first, same rule as REST/socket). Client optimism is never a trust
  boundary.
- **Single-writer invariant is correctness-critical** — enforce zero overlap at the client transition:
  never REST-flush a note whose provider is connected, never connect the provider until flushing stops.
- **Realtime co-editing is untouched** — cursors/presence and the made-private kick remain a Hocuspocus
  concern; this spec only decides *when* the provider is attached.
- **No `as any`.** Strict TS; Biome style (2-space, double quotes, 100 cols).
- **TDD:** failing goal-state tests first (api PUT derive+bump, helper parity, single-writer, handoff,
  offline durability), then green + `tsc --noEmit` + Biome.

## Risks / notes
- **Two writers to `note_doc`.** REST (private) and Hocuspocus (shared) both write the same row. Safe
  only under the single-writer invariant; the table now has two legitimate writers, so any future
  migration/locking must account for both paths (ADR-0008).
- **Transition overlap window.** During a handoff the design target is zero overlap (stop one writer
  before starting the other). A brief overlap is *tolerable* — both write CRDT-convergent full-state
  blobs — but not the target; the controller must sequence teardown → setup, and the tests assert
  exactly-one-writer at every instant.
- **Owner is not kicked on make-private.** The revoke path disconnects non-owners only; the owner's
  client must self-drive the public→private handoff (tear down its provider, resume REST). Miss this
  and the owner keeps a live socket on a now-private note (two-writer risk). Explicitly tested.
- **Full-blob cost.** Each flush sends the whole doc (matches `note_doc`'s full-state storage, so no
  server-side Yjs merge runtime is added). Base64-in-JSON adds ~33% over raw bytes; debounce mitigates
  frequency. Acceptable for note-sized docs; revisit (octet-stream / incremental updates) only if docs
  grow large — see future-work.
- **`meta_version` naming.** ADR-0008 wrote `note_meta.version`; the canonical engine name (brief +
  spec 14/16) is `note.meta_version`. This spec uses the canonical name and relies on spec 16 having
  added the column by build order (see decisions.md).
- **jsdom has no IndexedDB.** The `y-indexeddb`/controller web tests need `fake-indexeddb` (dev-only,
  e.g. `fake-indexeddb/auto` in the sync test setup); keep it out of the app bundle. The full web
  Vitest suite OOMs on default parallel — run `--maxWorkers=1`.
- **Optimistic-title flicker.** The local derive can momentarily differ from the server's (e.g. edge
  truncation) until the next pull reconciles. Acceptable — server value is authoritative and the
  divergence window is a debounce + round-trip.
- **Failed-flush classification.** A rejected `PUT /content` (offline/5xx vs a permanent 4xx) should be
  classified like metadata pushes (ADR-0009). Spec 20 queues/retries transient failures; wiring content
  flushes into spec 21's transient-vs-permanent toast is deferred to spec 21 (future-work).
