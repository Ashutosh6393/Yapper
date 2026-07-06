# 21 · Rollback UX — classify transient vs permanent — Design

This spec closes the mutation lifecycle for the metadata lane (ADR-0007) by defining what happens
**after a pushed mutation fails**. With base + queue → materialize (ADR-0003), a server rejection makes
an optimistic effect vanish silently on the next `rebuild()` — a rename undoes itself, a trashed note
reappears — with no explanation. But not every failure is a rejection: an offline blip or a 5xx is
transient and must **not** throw away the user's work. This spec makes the pusher **classify** every
push outcome and react correctly: transient failures stay queued and retry silently with backoff;
permanent rejections drop the mutation, revert via `rebuild()`, and raise a `toast("Couldn't <action>")`
whose copy is derived from the server's reason code.

Spec 21 owns three things: the **classifier** (transient vs permanent), the **retry/backoff policy**
for transient failures, and the **`reasonCode → user-facing toast copy` mapping**. It does not build the
pusher, the queue, or the pull loop — those are spec 19 (`apps/web/lib/sync/push.ts`) and spec 16
(`apps/web/lib/sync/pull.ts`). Spec 21 plugs its logic into the pusher's outcome handler. Everything
stays behind `NEXT_PUBLIC_SYNC_ENGINE` (`isSyncEngineEnabled()`); when the flag is off the app keeps
today's TanStack Query notes path (spec 13's `apps/web/lib/queries/optimistic.ts`), which is unaffected.

## Goal State (acceptance)

1. **Network blip = silent retry then success.** A metadata action taken while offline or during a
   network hiccup applies optimistically (spec 19), the push fails transiently, and the mutation stays
   in `db.mutations` with **no toast**. The pusher retries with backoff; when connectivity returns the
   push succeeds and the optimistic effect stands. `lastMutationID` is **never advanced** for a
   transient failure, so the same mutation is re-sent until it lands.
2. **403 = revert + toast.** A user who has lost edit access renames a note: the rename shows
   optimistically, the push returns a per-mutation verdict `rejected(reason: "forbidden")`, the client
   drops the mutation from `db.mutations`, `rebuild()` reverts the rename in `db.notes` (the UI reverts
   via `useLiveQuery`), and a toast reads **"You no longer have access to this note."**
3. **422 / 409 = revert + generic toast.** A validation reject (`invalid`) or conflict reject
   (`conflict`, e.g. `permanentDeleteNote` on a note that is no longer trashed) reverts the optimistic
   effect and toasts **"Couldn't `<action>`."** with the action phrase derived from the mutation name.
4. **The queue never wedges on a poison mutation.** A permanently-rejected mutation is **dropped** (the
   server advanced `lastMutationID` past it without applying, per ADR-0007), not retried forever. Later
   queued mutations continue to push and settle normally; a single bad entry can never block the queue.
5. **Idempotency-safe retries.** A transient retry re-sends the **same `seq` / `clientGroupID`**. If the
   original push actually applied server-side but its response was lost (timeout), the re-push is a
   **no-op** (server's `lastMutationID` guard skips `seq <= lastMutationID`), and the note keeps a single
   effect — a retry can never double-apply.
6. **Rejected Undo is not special-cased.** An Undo that fires an inverse mutation (e.g. `restoreNote`)
   which is itself permanently rejected reverts and toasts through the exact same path as any other
   rejection — no dedicated Undo handling.
7. **Classifier correctness.** The classifier maps: offline (`fetch` rejects) / network error / request
   timeout / `5xx` → **transient**; a `200` push response carrying per-mutation `rejected(reasonCode)`
   verdicts (`403`→`forbidden`, `422`→`invalid`, `409`→`conflict`, `404`→`not_found`) → **permanent**.
   `applied` verdicts are neither — they are confirmed and dropped on the pull's `lastMutationID`
   (spec 16 / ADR-0004).
8. **Bounded, self-resetting backoff.** Transient retry delay grows exponentially with jitter, capped;
   the backoff attempt counter resets to zero on a successful push and on a reconnect / focus / poke
   nudge, so recovery is immediate when the network returns rather than waiting out a long delay.

## Scope

**In:**
- `apps/web/lib/sync/classify.ts` (new) — `classifyPushOutcome()`: turns a push result (a parsed
  `pushResponse`, or a thrown transport error) into `{ kind: "settled", rejected } | { kind: "transient" }`.
- `apps/web/lib/sync/backoff.ts` (new) — `nextBackoffDelay(attempt)` + the transient retry scheduler
  (timer + `online`/focus/poke reset).
- `apps/web/lib/sync/reject-copy.ts` (new) — `rejectToastCopy(name, reason)`: the
  `(mutationName, reasonCode) → string` toast copy map (owns the action-phrase table + reason overrides).
- Wiring the above into the spec-19 pusher outcome handler (`apps/web/lib/sync/push.ts`): on `settled`,
  drop each `rejected` mutation from `db.mutations`, `rebuild()`, and `toast.error(rejectToastCopy(...))`
  via the `components/ui/sonner` seam; on `transient`, keep the batch queued and schedule a backoff retry.
- The **reject-reason contract** in `@yapper/schemas`: finalize `pushRejectReasonSchema` (the `reasonCode`
  enum) that the spec-14/19 `pushResponseSchema` verdict references. Shared by web + api.
- The **server error → reasonCode** mapping in the spec-19 push handler
  (`apps/api/src/sync/push.ts`): permission/validation/conflict/not-found service errors become a
  `rejected(reasonCode)` verdict (with `lastMutationID` advanced, unapplied); an **unexpected** error
  (DB down, etc.) throws so the whole request `5xx`s → the client classifies it transient.

**Out (see `future-work.md`):**
- The pusher/queue framework and `db.mutations` mechanics (spec 19), the pull loop + `lastMutationID`
  confirmation of `applied` mutations (spec 16 / ADR-0004), and the SSE poke transport (spec 17).
- The named client/server mutators and `meta_version` bumping (spec 19 / ADR-0007).
- Offline **detection UX** (a global "You're offline" banner) — the ADR mandates *silence* for
  transient failures; a connectivity indicator is a separate concern.
- Toast de-duplication / queuing policy for a burst of rejections (best-effort; sonner's own stacking).
- Per-mutation "Retry now" affordance for permanent rejects (they are dropped by design).
- Any change to spec 13's `apps/web/lib/queries/optimistic.ts` (the old flag-off path).

---

## The classifier

Two levels, because permanent rejections ride **inside** a `200` response body while transient failures
mean there is **no** usable body.

```
classifyPushOutcome(input):
  input is either the parsed pushResponse (HTTP 200, schema-valid body)
                 or a PushTransportError thrown by the pusher's fetch wrapper

  if input is a PushTransportError:              # offline / network / timeout / 5xx / non-200
      return { kind: "transient" }               # keep whole batch queued, do NOT advance lastMutationID
  else:                                          # a valid pushResponse
      rejected = input.mutations
                   .filter(m => m.verdict === "rejected")
                   .map(m => ({ seq: m.seq, name: m.name, reason: m.reason }))
      return { kind: "settled", rejected }       # applied ones confirmed via pull's lastMutationID
```

The pusher's fetch wrapper (spec 19) throws a `PushTransportError` for: a rejected `fetch` promise
(offline / DNS / connection reset), an `AbortError` from the request timeout, and any non-`2xx` status
(covers `5xx`, and also `401`/`429` which are transient-by-nature — session refresh / rate limit — and
must be **retried, not dropped**). Only a schema-valid `200` body yields per-mutation verdicts. So a
malformed `200` body (should never happen) also falls to `transient` — safe, because a transient retry
is idempotent (Goal 5).

> **Why `401`/`429` are transient, not permanent:** they are request-level, not a considered per-mutation
> verdict; the correct response is "wait and re-send," not "throw the user's work away." Only reason codes
> the server returns *inside* a `200` push response are permanent. This keeps the permanent set to
> deliberate, per-mutation rejections.

## Reason codes and toast copy

Spec 21 owns `pushRejectReasonSchema` in `@yapper/schemas` and the copy map. The reason set is
deliberately small; the server maps its service-layer errors onto it (see below).

| reasonCode   | server condition (HTTP)            | example trigger                                   |
|--------------|------------------------------------|---------------------------------------------------|
| `forbidden`  | permission denied (`403`)          | rename/share a note you no longer own or can edit |
| `invalid`    | schema/validation failure (`422`)  | mutation args fail the server-side check          |
| `conflict`   | state conflict (`409`)             | `permanentDeleteNote` on a note that isn't trashed |
| `not_found`  | target row gone (`404`)            | mutation on a note hard-deleted elsewhere         |

`rejectToastCopy(name, reason)` composes a message from a **mutation-name → action phrase** table plus a
**reason override**:

```
ACTION_PHRASE = {
  createNote: "create the note", renameNote: "rename the note",
  archiveNote: "archive the note", unarchiveNote: "unarchive the note",
  trashNote: "move the note to trash", restoreNote: "restore the note",
  permanentDeleteNote: "delete the note", setShareLevel: "change sharing",
  makePrivate: "make the note private", createLabel: "create the label",
  renameLabel: "rename the label", deleteLabel: "delete the label",
  applyLabel: "add the label", removeLabel: "remove the label",
}

rejectToastCopy(name, reason):
  if reason === "forbidden": return "You no longer have access to this note."
  if reason === "not_found": return "That note no longer exists."
  return `Couldn't ${ACTION_PHRASE[name]}.`      # invalid / conflict → generic, action-specific
```

`forbidden` and `not_found` get access/existence-specific copy (clearer than "couldn't rename");
`invalid` and `conflict` fall through to the generic `"Couldn't <action>."`. Copy is **best-effort and
generic** by ADR-0009 — the server never returns user-ready prose, only a reason code.

## Backoff policy

Transient retries re-push the **entire** pending queue (in `seq` order) — not a single mutation — because
a transient failure means the batch never reached the server. Idempotency (Goal 5) makes re-pushing
already-applied mutations free.

```
nextBackoffDelay(attempt):     # attempt is 0-based count of consecutive transient failures
  base   = 1000                 # 1s
  cap    = 30_000               # 30s ceiling
  raw    = min(cap, base * 2 ** attempt)      # 1s, 2s, 4s, 8s, 16s, 30s, 30s, …
  jitter = raw * (0.8 + Math.random() * 0.4)  # ±20% to de-sync many tabs/clients
  return Math.round(jitter)
```

- **Never give up.** There is no max-attempts for transient failures — the mutation is the user's data
  and must eventually land. Only a *permanent* verdict drops a mutation (that is the poison-pill escape,
  Goal 4).
- **Don't spin while offline.** When `navigator.onLine === false`, do not schedule a timer; wait for the
  `online` event, then retry immediately.
- **Reset on recovery.** The attempt counter resets to `0` on any successful push, and a
  reconnect (`online`) / window `focus` / incoming poke (spec 17) triggers an **immediate** retry
  (bypassing the current timer). This is why the delay cap is safe: recovery does not wait out a 30s timer.
- **Single in-flight push.** The pusher (spec 19) serializes pushes; the backoff scheduler only ever has
  one pending retry timer. A new local mutation also nudges an immediate push attempt.

## Flow — permanent rejection (Goal 2)

```
user renames note (lost edit access)
  → renameNote client mutator queued in db.mutations (seq=N); rebuild() → db.notes shows new title
  → pusher POST /api/sync/push { clientGroupID, mutations:[{seq:N, name:"renameNote", args}] }
  → server: authorize → DENIED (403) → advance lastMutationID past N WITHOUT applying,
            verdict = rejected(reason:"forbidden")   [ADR-0007]
  → 200 body: { mutations:[{seq:N, verdict:"rejected", reason:"forbidden"}], lastMutationID:N, … }
  → classifyPushOutcome → { kind:"settled", rejected:[{seq:N, name:"renameNote", reason:"forbidden"}] }
  → drop seq N from db.mutations → rebuild() reverts title in db.notes (UI reverts via useLiveQuery)
  → toast.error("You no longer have access to this note.")
```

## Flow — transient failure (Goal 1)

```
user archives note while offline
  → archiveNote queued (seq=N); rebuild() → card leaves active view immediately
  → pusher POST fails (fetch rejects — offline) → PushTransportError
  → classifyPushOutcome → { kind:"transient" }
  → keep seq N in db.mutations; NO toast; lastMutationID unchanged
  → schedule retry: navigator.onLine === false → wait for "online" event
  → on reconnect: immediate re-push (same seq N) → 200 applied → pull confirms lastMutationID ≥ N
    → seq N dropped by the pull loop (spec 16); note stays archived
```

## Files to touch

| File | Change |
|---|---|
| `packages/schemas/src/sync.ts` | Finalize `pushRejectReasonSchema = z.enum(["forbidden","invalid","conflict","not_found"])`; the `pushResponse` per-mutation verdict's `reason` field references it. Coordinate with spec 14 (skeleton) / spec 19 (owner of the verdict shape). Export the inferred `PushRejectReason`. |
| `packages/schemas/src/index.ts` | Re-export the reason schema/type. |
| `apps/web/lib/sync/classify.ts` (new) | `classifyPushOutcome()` + the `PushTransportError` type contract (thrown by the spec-19 fetch wrapper). |
| `apps/web/lib/sync/backoff.ts` (new) | `nextBackoffDelay()` + the transient retry scheduler (timer + `online`/focus/poke reset). |
| `apps/web/lib/sync/reject-copy.ts` (new) | `ACTION_PHRASE` table + `rejectToastCopy(name, reason)`. |
| `apps/web/lib/sync/push.ts` (spec 19) | In the outcome handler: branch on `classifyPushOutcome`; `settled` → drop rejected seqs + `rebuild()` + `toast.error`; `transient` → keep queued + schedule backoff retry. |
| `apps/api/src/sync/push.ts` (spec 19) | Map service-layer errors (`@yapper/permissions` denial → `forbidden`, Zod arg failure → `invalid`, lifecycle conflict → `conflict`, missing row → `not_found`) to a `rejected(reason)` verdict with `lastMutationID` advanced; let unexpected errors throw (→ `5xx` → client transient). |

Toasts go through the existing `apps/web/components/ui/sonner.tsx` seam (`toast.error`) — never import
`sonner` directly. `rebuild()` and `db.mutations` come from spec 15 (`apps/web/lib/sync/db.ts`).

## TDD — tests to write first

Write these failing first; a slice is done only when green + `tsc --noEmit` clean + Biome clean. Run
web tests from `apps/web` with `bunx vitest run --maxWorkers=1` (the full suite OOMs on the default
parallel run — project memory).

1. **`apps/web/lib/sync/classify.test.ts`** — `classifyPushOutcome`:
   - a thrown `PushTransportError` (offline / `AbortError` / `503`) → `{ kind: "transient" }`.
   - a `200` body with mixed verdicts → `{ kind: "settled", rejected: [only the rejected ones, with
     seq/name/reason] }`; `applied` verdicts are absent from `rejected`.
2. **`apps/web/lib/sync/backoff.test.ts`** — `nextBackoffDelay` grows `1s→2s→4s…` and is capped at
   `30s`; jitter stays within ±20% of the raw value; the scheduler resets `attempt` to `0` on a
   simulated `online` / success and retries immediately (fake timers).
3. **`apps/web/lib/sync/reject-copy.test.ts`** — `rejectToastCopy`: `("renameNote","forbidden")` →
   `"You no longer have access to this note."`; `("archiveNote","conflict")` → `"Couldn't archive the
   note."`; every `mutationSchema` name has an `ACTION_PHRASE` entry (table-completeness test).
4. **`apps/web/lib/sync/push.rollback.test.ts`** (integration over a fake/in-memory Dexie from spec 15):
   - **permanent reject drops + reverts + toasts:** queue `renameNote`, push returns
     `rejected(forbidden)` → `db.mutations` no longer contains that seq; `db.notes` title is reverted
     after `rebuild()`; `toast.error` called with the forbidden copy.
   - **transient keeps queued + retries:** push throws `PushTransportError` → the seq remains in
     `db.mutations`; `toast` **not** called; `lastMutationID` unchanged; a retry is scheduled.
   - **idempotent retry:** re-push a seq the server already applied (guard skips it) → no double effect;
     no error toast.
   - **rejected Undo:** an inverse `restoreNote` that returns `rejected(conflict)` reverts + toasts via
     the same path (no special case).
   - **queue does not wedge:** a rejected seq N is dropped while a later seq N+1 still pushes and settles.
5. **`apps/api/src/sync/push.rollback.test.ts`** (server, `bun test` from `apps/api`): a mutation the
   user isn't authorized for → verdict `rejected(reason:"forbidden")` **and** `lastMutationID` advanced
   without the row being mutated; a valid mutation in the same batch → `applied`; an unexpected error
   → the request throws (`5xx`), no partial verdicts leak.

## Dependencies (build order)

Spec numbers follow ADRs; **build order differs** (see the shared map). Spec 21 (ADR-0009) is built
**after** its two prerequisites and before poke/content:

- **Spec 19 (ADR-0007, named-mutators)** — provides the pusher (`apps/web/lib/sync/push.ts`), the
  server push handler (`apps/api/src/sync/push.ts`), `db.mutations`, `rebuild()`, and the
  `applied|rejected` verdict shape. Spec 21 plugs the classifier + backoff + copy into this pusher.
- **Spec 16 (ADR-0004, cvr-delta-pull)** — provides the pull loop that advances `lastMutationID` and
  drops **applied** mutations from the queue. Spec 21 only handles **rejected** (drop-now) and
  **transient** (keep-and-retry); it relies on spec 16 to clean up applied mutations.
- **Spec 14 (ADR-0002, sync-foundations)** — the `@yapper/schemas` sync contract skeleton
  (`pushResponseSchema`) that spec 21 finalizes the `reasonCode` enum within.

Recommended global sequence: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.** Spec 21 slots right after
the pull loop so both the drop-now and drop-on-pull paths exist. Everything stays behind
`NEXT_PUBLIC_SYNC_ENGINE` until the sequence completes.

## Cross-cutting rules

- **Contracts in `@yapper/schemas`.** The `reasonCode` enum is defined once and imported by web + api;
  never duplicate it per app. Derive types with `z.infer`. No `as any`.
- **Permissions stay server-authoritative.** The `forbidden` verdict comes from `@yapper/permissions`
  in the server mutator (same cache-first rule as REST/socket). Client optimism is never a trust
  boundary — a rejected mutation is *corrected* by revert, it was never authoritative.
- **Toasts through the `components/ui/sonner` seam** (`toast.error`), never a scattered `sonner` import.
  Error-always for permanent rejects; **silence** for transient failures (ADR-0009). No toast spam.
- **Behind the feature flag.** All spec-21 wiring lives inside the `isSyncEngineEnabled()` engine path;
  the flag-off TanStack Query path (spec 13) is untouched and keeps working.
- **Realtime co-editing is orthogonal.** `makePrivate`'s socket revoke/kick (Hocuspocus) is unchanged;
  a rejected `makePrivate` mutation reverts locally via this spec, independently of the kick channel.
- **Style.** Strict TS, Biome (2-space, double quotes, 100 cols). Small, reviewable diffs.

## Risks / notes

- **Dependent-mutation cascade.** Dropping a rejected mutation and `rebuild()`ing replays later
  mutations over a base that lacks the dropped effect (e.g. a `renameNote` after a rejected `createNote`).
  A now-orphaned dependent may itself be rejected server-side (`not_found`) → dropped + toasted. The
  queue self-heals, but the user may see two toasts. Acceptable; ordering is preserved by `seq`.
- **Toast burst.** A long offline session that accumulates several permanently-invalid mutations can
  emit several rejection toasts at reconnect. Sonner stacks them; a de-dup/coalesce policy is
  future-work, not a correctness issue.
- **Lost-response ambiguity.** A push that applied server-side but whose response was lost is
  indistinguishable from a true transient failure — both are retried. Idempotency (`lastMutationID`
  guard) makes the retry a no-op, so this is safe by construction (Goal 5); the pull reconciles the
  truth.
- **Reason-code coverage drift.** If a server mutator throws an error type not mapped to a reason code,
  it must fall through to an unexpected `5xx` (→ transient retry), **not** a silent apply. The server
  mapping is deny-by-default: only the four known reasons produce a `rejected` verdict; everything else
  throws. Guarded by the server test (TDD #5).
- **`navigator.onLine` is a hint, not truth.** It can report `true` on a captive/broken network. Backoff
  still applies (the push will `PushTransportError` and re-schedule), so `onLine` is only an
  optimization for *when* to first retry, never a gate on whether to.
