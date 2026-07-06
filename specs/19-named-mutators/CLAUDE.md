# CLAUDE.md — 19 · Named, Asymmetric Mutators

## Project Context

The **write half** of the metadata lane (ADR-0007): the mutation framework, all **14 named mutators**,
and the push protocol. Each name gets **two** implementations — **asymmetric**: a **client mutator**
(pure, replayable, optimistic-local only, folded by `rebuild()` — no side effects) and a **server
mutator** (authoritative, reuses existing lifecycle/sharing/label service logic, bumps
`note.meta_version`, and — for `makePrivate` — rotates the token, revokes collaborators, fires the
existing Redis revoke/kick). The client enqueues `{seq,name,args}` in `db.mutations` + `rebuild()`s;
the pusher POSTs to `POST /api/sync/push`, which applies in `seq` order, de-dupes via
`sync_client.last_mutation_id`, and returns a per-mutation verdict.

Landing this **retires spec-13's optimistic layer** when the flag is on (all 14 actions move onto the
engine together). Flag off ⇒ today's TanStack Query path unchanged. Consumes spec 18's createNote
contract; publishes pokes on spec 17's channel; exposes the outcome-handler seam spec 21 plugs into.
Behind `NEXT_PUBLIC_SYNC_ENGINE`.

## Before Starting Work

1. Read `specs/19-named-mutators/design.md` (Goal State + the registry table, the push protocol
   pseudo-code, `makePrivate` side effects, and TDD).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0007-…` (+ `0002-…`,
   `0006-…` createNote, `0009-…` verdicts).
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `specs/14-sync-foundations/design.md` (`mutationSchema` 14 names + args, `pushRequest/Response`,
     `db.mutations`/`db.base`/`db.sync`, `getClientGroupID()`) + `specs/21-rollback-ux/design.md` (the
     verdict/reasonCode classification the push handler produces).
   - `apps/api/src/notes/router.ts` + `apps/api/src/labels/router.ts` (the inline lifecycle/share/label
     DB bodies to **extract into service functions**) + `apps/api/src/notes/private.test.ts` (the
     make-private assertions to mirror via push).
   - `apps/socket/src/revoke.ts` + `packages/permissions` (`revokeChannel`, `bustNotePermissions`,
     `resolvePermission` — reused, not reimplemented).
   - `apps/web/lib/queries/optimistic.ts` + `notes.ts` + `labels.ts` (the spec-13 optimism being
     superseded — read, don't delete until cutover) + `app/dashboard/page.tsx` (action wiring).

## Code Patterns

- **Two registries, one keyset.** `apps/web/lib/sync/mutators.ts` (14 pure `ClientMutator`s folded by
  `rebuild()`) and `apps/api/src/sync/mutators.ts` (14 authoritative `ServerMutator`s). Type both from
  the `mutationSchema` union so a missing/renamed name is a **compile error**.
- **Client mutator = optimistic-local only**: mutate the draft, no I/O, no authorization, no side
  effects. `makePrivate` client mutator sets only `access = "private"`. Rollback is free: drop a
  mutation → re-`rebuild()` reverts it (the primitive spec 21 relies on).
- **Server mutator = authorize → apply (reuse service fn) → `bumpMetaVersion(tx, noteId)` → optional
  post-commit closure.** Deny-by-default: throw `MutationRejected("forbidden"|"invalid"|"conflict"|
  "not_found")` for permanent failures; let unexpected errors throw (→ 5xx → client transient).
- **`enqueue(mutation)`** (`mutate.ts`): insert `{seq(auto),name,args}` into `db.mutations` → `rebuild()`
  → nudge the pusher. Per-action helpers (`archiveNote(id)`, `renameNote(id,title)`, …) call it.
- **Push handler**: parse `pushRequestSchema`; apply mutations in ascending `seq`, **one txn each** that
  advances `sync_client.last_mutation_id` in lock-step; **skip `seq <= last_mutation_id`** (idempotent
  replay, verdict `applied`); return `{ lastMutationID, verdicts }`; publish pokes **after** commit.
- **`meta_version` bump is mandatory** for every surviving touched note (the CVR/spec-16 invariant).
  Deletes need no bump (surface as CVR `dels`).
- **Reuse existing service logic** — extract the inline route bodies into callable service functions the
  REST routes AND the server mutators both call, so semantics can't drift between flag-off and flag-on.
  Keep the extraction a pure refactor in its own step (existing `router.test.ts`/`private.test.ts` stay
  green).
- **`makePrivate` post-commit** runs `bustNotePermissions` + `redisPublisher.publish(revokeChannel(id),
  …)` **after** the txn — never inside it. The socket kick path is unchanged.
- **No `as any`** — registries and args typed from `@yapper/schemas`.

## Repo Gotchas (for the implementer)

- **No local Docker** — DB = Neon, Redis = Upstash. api tests hit real Neon via supertest + fake
  `SessionResolver`; run from `apps/api` (`bun test`), not repo root; no concurrent `bun test` procs.
- **Web Dexie/replay tests** use `fake-indexeddb/auto`; run from `apps/web` with
  `bunx vitest run --maxWorkers=1`.

## Don't

- **Don't leave a subset of actions on `optimistic.ts` when the flag is on** — all 14 flip together, or
  two optimistic systems fight over the same list (ADR-0007). The flag-off path stays whole until cutover.
- **Don't authorize or perform side effects in a client mutator** — it's a best-effort preview; the
  server mutator is the source of truth.
- **Don't silently apply on an unmapped error** — only the four `MutationRejected` reasons produce a
  `rejected` verdict; everything else throws to 5xx (transient). Poison mutations must be droppable.
- **Don't skip the `meta_version` bump** on a surviving touched note — clients go stale.
- **Don't reimplement lifecycle/share/label logic** — extract and reuse the existing service code.
- **Don't build the puller (spec 16), the CVR, the classifier/backoff/copy (spec 21), or the SSE
  transport (spec 17)** — expose their seams; publish the poke, produce the reason codes.
- **Don't delete `optimistic.ts` / the retired Query hooks** — that's the final cutover (spec 14 plan).
- **Don't touch the socket kick/subscriber**, and don't read the env var outside `flag.ts`.
