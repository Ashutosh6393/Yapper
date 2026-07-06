# CLAUDE.md — 21 · Rollback UX (classify transient vs permanent)

## Project Context

Closes the mutation lifecycle for the metadata lane (ADR-0009). After a pushed mutation **fails**, the
pusher must **classify** the outcome and react: **transient** failures (offline / network / timeout /
`5xx` / `401` / `429`) stay queued and retry silently with backoff; **permanent** rejections (a `200`
push body carrying per-mutation `rejected(reasonCode)` verdicts — `forbidden`/`invalid`/`conflict`/
`not_found`) drop the mutation, revert via `rebuild()`, and raise a `toast("Couldn't <action>")`.

Spec 21 owns exactly three things: the **classifier** (`classify.ts`), the **retry/backoff policy**
(`backoff.ts`), and the **reasonCode → toast copy** map (`reject-copy.ts`) — plus finalizing
`pushRejectReasonSchema` in `@yapper/schemas` and the server error→reasonCode mapping in spec 19's push
handler. It does **not** build the pusher, the queue, or the pull loop (spec 19 / spec 16); it plugs
into the spec-19 pusher's outcome handler. Everything is behind `isSyncEngineEnabled()`; with the flag
off, spec 13's `apps/web/lib/queries/optimistic.ts` path is untouched.

## Before Starting Work

1. Read `specs/21-rollback-ux/design.md` (Goal State + the classifier, reason-code/copy tables, backoff
   policy, both flow walk-throughs, files-to-touch, and TDD).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0009-…`.
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `specs/14-sync-foundations/design.md` — the finalized `pushResponseSchema` verdict shape this spec
     completes the `reason` enum within (do not rename its fields).
   - `specs/19-named-mutators/design.md` — the pusher (`apps/web/lib/sync/push.ts`) + server push
     handler (`apps/api/src/sync/push.ts`) this spec plugs into; the `applied|rejected` verdict + the
     `lastMutationID`-advanced-without-applying rule for permanent rejects.
   - `specs/16-cvr-delta-pull/design.md` — the pull loop that drops **applied** mutations (spec 21 only
     handles rejected + transient).
   - `apps/web/lib/queries/optimistic.ts` — the spec-13 toast/rollback pattern being superseded (read,
     don't touch).
   - `apps/web/components/ui/sonner.tsx` — the `toast` seam (`toast.error`); never import `sonner`
     directly.

## Code Patterns

- **Two-level classify:** permanent rejections ride **inside** a schema-valid `200` body (per-mutation
  `rejected(reason)` verdicts); every other failure (thrown `PushTransportError` — offline / timeout /
  non-`2xx` incl. `401`/`429`/`5xx`) is **transient**. `applied` verdicts are neither — the pull
  confirms and drops them via `lastMutationID` (spec 16).
- **Transient = keep + retry, silent.** Never advance `lastMutationID`; never toast; re-push the whole
  pending queue (in `seq` order) — idempotency (`lastMutationID` guard) makes re-pushing applied
  mutations a no-op.
- **Permanent = drop + revert + toast.** Drop the rejected `seq` from `db.mutations`, `rebuild()` (UI
  reverts via `useLiveQuery`), `toast.error(rejectToastCopy(name, reason))`.
- **Backoff:** exponential `1s→2s→4s…` capped at `30s`, ±20% jitter; **never give up** on transient
  (only a permanent verdict drops a mutation); don't spin while `navigator.onLine === false` (wait for
  `online`); reset the attempt counter and retry **immediately** on success / `online` / focus / poke.
- **Copy map:** `forbidden` → "You no longer have access to this note."; `not_found` → "That note no
  longer exists."; else `"Couldn't ${ACTION_PHRASE[name]}."`. Best-effort/generic (ADR-0009) — the
  server returns only a reason code, never user prose.
- **Reason enum in `@yapper/schemas`** (`pushRejectReasonSchema = z.enum(["forbidden","invalid",
  "conflict","not_found"])`), imported by web + api. No `as any`.
- **Server mapping is deny-by-default:** only the four known service errors produce a `rejected(reason)`
  verdict (with `lastMutationID` advanced); any **unexpected** error throws → `5xx` → client transient.
  Never silently apply.

## Repo Gotchas (for the implementer)

- **jsdom has no IndexedDB / timers:** the `push.rollback` integration test uses a fake/in-memory Dexie
  (from spec 15, `fake-indexeddb`) and `vi.useFakeTimers()` for backoff. Run web tests from `apps/web`
  with `bunx vitest run --maxWorkers=1` (full suite OOMs on default parallel).
- **Server test** (`apps/api/src/sync/push.rollback.test.ts`) runs with `bun test` from `apps/api`
  against Neon; do not run concurrent `bun test` processes (lock-deadlock).

## Don't

- **Don't build the pusher, queue, pull loop, or mutators** — those are specs 19/16/15. Spec 21 is the
  classifier + backoff + copy wiring only.
- **Don't toast on transient failures** — ADR-0009 mandates silence; a connectivity banner is separate
  (future-work).
- **Don't classify `401`/`429` as permanent** — they are request-level and must be retried, not dropped.
  Only per-mutation reason codes inside a `200` body are permanent.
- **Don't drop a transient mutation or advance `lastMutationID` for it** — that would lose user data.
- **Don't re-add reverted rows to the cache by hand** — `rebuild()` is the single source of the
  optimistic view.
- **Don't touch** `apps/web/lib/queries/optimistic.ts` (the flag-off path) or import `sonner` directly.
- **Don't special-case Undo** — a rejected inverse mutation reverts + toasts through the same path.
