# 26 · Sync Identity — Implementation

## Status: not started

Branch: `feat/sync-identity` (cut from `feat/frontend-hardening`)

> **Stacks on PR #51 (spec 25).** 26c extends the `PushOutcome` union that 25b introduced. Merge #51
> first, then rebase this onto `main`.

## Evidence (captured live, 2026-07-14)

Not reconstructed from code — observed in the running app:

```
POST /api/sync/push  →  403 {"error":"Client group bound to another user"}

db.sync       clientGroupID: 8a611e9c…   (bound to a DIFFERENT user)
              lastMutationID: 57
db.mutations  seq 58 setShareLevel(view)      ← never applied
              seq 59 setShareLevel(edit)      ← never applied
              seq 60 setShareLevel(view)      ← never applied
db.base       access: "private", shareToken: null      ← what the server actually has
db.notes      access: "view"                            ← what the user was shown
```

The UI had been painting the optimistic replay over the server's real state for an unknown length of time.
No toast, no console line, no badge. The **only** visible symptom was a missing Copy-link button — the
share token is the one field the client cannot fabricate optimistically, so it was the honest field in a
lying UI.

Re-minting the `clientGroupID` drained the queue immediately (push `200`, `lastMutationID: 60`, base
`access: "view"` with a real token). That confirms the diagnosis end to end.

## Slices

- [ ] **26a — wipe on sign-out** ⚠️ *privacy* (`apps/web/lib/sync/reset.ts` + test,
      `apps/web/app/dashboard/page.tsx`)
      Sign-out: flush the queue → if it still won't drain, confirm the discard with a count → `db.delete()`
      + clear the y-indexeddb note docs → sign out.
      **Ship this first.** It is the privacy bug (user A's notes rendered to user B), and it cures the
      stale `clientGroupID` at the root as a side effect.
      Goal-state test: a seeded Dexie is empty after sign-out; a non-empty queue prompts rather than
      silently discarding (ADR-002).

- [ ] **26b — identity** (`apps/web/lib/sync/db.ts`, `apps/api/src/sync/pull.ts` + test)
      `getClientGroupID(userId)` persists the minting user and re-mints on mismatch — defence in depth for
      when 26a's wipe didn't happen (crash, force-quit, failed delete).
      `handlePull` enforces the same binding `handlePush` already does: **a half-working app is harder to
      debug than a broken one** (ADR-004), and this asymmetry is exactly why the bug hid.
      Goal-state test: a different `userId` re-mints; `POST /pull` `403`s on a foreign client group.

- [ ] **26c — blocked pushes** (`apps/web/lib/sync/classify.ts` + test, `push.ts`, a banner)
      `PushOutcome` gains `{ kind: "blocked"; status }`. The pusher **stops** (no `scheduleRetry` — waiting
      cannot fix a `403`), keeps the queue, `reportError`s (a client/server disagreement is always a bug),
      and tells the user their changes are not saving.
      Generalizes ADR-003 (spec 25) into a rule so the next status code needs no ADR: **retry only what
      waiting can fix.**
      Goal-state test: `classify` → `blocked` for `403`; the pusher schedules no retry and preserves the
      queue.

- [ ] **26d — drift visibility** (`apps/web/lib/sync/pull.ts` + test)
      Dev-only: diff the raw pull payload's keys against the parsed result; report what Zod discarded.
      **Not** `z.strictObject` — that would forbid the server adding a field before every client updates,
      turning a silent-drop bug into a hard-outage bug (ADR-006).
      Goal-state test: a payload with an unknown key reports; a clean one doesn't.

- [ ] **26e — pull immediately after a settled push** (`apps/web/lib/sync/push.ts` + test)
      Two lines: `void pull()` on a `settled` outcome.
      Reported by the user after the queue was unjammed: *"the copy button does show up but after
      sometime, not instantly."* The token is server-minted and cannot be faked optimistically, so on the
      engine path the owner's own link only arrives on a pull — and the only thing that triggers one is the
      SSE poke. So the actor waits on a Redis fanout **designed to notify other people**, plus a 300ms
      coalesce (`poke.ts:19`). With `REDIS_URL` unset, `publishPokes` no-ops and the link never appears at
      all.
      A `settled` outcome *is* the server's confirmation. The pusher already knows what the poke exists to
      tell it.
      Goal-state test: a settled push triggers a pull; a transient one does not.

## Verification

From `apps/web`: `bunx vitest run --no-file-parallelism` and `bun run check-types`.
From `apps/api`: `bun test`.

Browser checks no unit test covers:
- 26a: sign in as A, create notes, sign out, sign in as B → B's dashboard shows **no trace of A**, offline
  included (DevTools → Application → IndexedDB → `yapper-sync` should not exist between sessions).
- 26c: bind a client group to another user (or hand-edit `db.sync`) → the pusher stops, a banner appears,
  and `db.mutations` is intact.

## Notes / gotchas

- **Never run `next build` in `apps/web` while `turbo dev` is running.** Both use `apps/web/.next`; the
  production build leaves the dev server serving stale chunks. This masked Gap 4 during diagnosis — the
  running bundle predated commit `acc8f82` and had no `shareToken` in it at all.
