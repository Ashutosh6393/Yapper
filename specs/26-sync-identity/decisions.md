# 26 · Sync Identity — Decisions

## ADR-001 — Sign-out wipes the local engine

**Context.** `signOut` (`dashboard/page.tsx:253-257`) clears the persisted session and nothing else. Dexie
survives: `db.notes` (the previous user's note titles + previews), `db.base`, `db.mutations`, and
`db.sync` (the `clientGroupID`).

**Decision.** Sign-out deletes the `yapper-sync` database and the y-indexeddb note docs.

**Why.** The dashboard renders `db.notes` through `useLiveQuery` on mount, *before* any pull can correct
it — so the next user on that browser sees the previous user's notes. Offline, permanently. That is user
A's data rendered to user B; it is a privacy bug, not a sync bug, and no amount of "the pull fixes it
shortly" makes it acceptable.

**Consequence.** This also cures Gap 2 at the root: a wiped Dexie mints a fresh `clientGroupID` on next
login, so a stale binding cannot exist. One deletion fixes both.

## ADR-002 — But the wipe must not eat unsynced work

**Decision.** With a non-empty `db.mutations`, sign-out first attempts a push. If mutations remain
(offline, or blocked), the user is told how many changes are unsaved and must confirm the discard.

**Why.** This entire spec is about data the app forgot it was holding. Fixing that by *silently deleting*
the user's unsaved writing would be the same failure wearing a different hat. It is the mirror of ADR-003
in spec 25 — never `signOut()` on a `401`, because the queue is the user's work — applied from the other
side: never *wipe* on sign-out without telling them what's in it.

## ADR-003 — `clientGroupID` is scoped to the user (defence in depth)

**Decision.** Persist the minting `userId` alongside the id; re-mint when the signed-in user differs.

**Why.** ADR-001's wipe should mean this never fires. It fires when the wipe *didn't happen* — a crash
mid-sign-out, a force-quit, a failed delete. The bug it prevents is **permanent and silent** (every push
`403`s forever, and before 26c, nothing says so). Ten lines to make an entire failure class impossible is
a trade worth taking, even behind a fix that should already cover it.

## ADR-004 — `pull` enforces the same client-group binding as `push`

**Context.** `push.ts:92` rejects a client group bound to another user. `pull.ts` has no such check — it
serves `authorizedNotes(userId)` for whoever is authenticated.

**Decision.** `handlePull` enforces the binding too.

**Why.** The asymmetry is *why this hid for so long.* Reads worked perfectly while every write was
rejected, so the app looked healthy: notes listed, dashboards rendered, and the optimistic replay painted
the user's own unsent mutations back at them. A consistent `403` on both would have broken loudly and
obviously the first time it happened.

**A half-working app is harder to debug than a broken one.** When invariants disagree, fail on both sides.

## ADR-005 — Retry only what waiting can fix

**Context.** Spec 25b gave `401` its own outcome because retrying cannot mint a session. `403` was left in
the transient bucket and retried forever at a 30s cap, silently — the exact bug ADR-003 (spec 25) was
written to kill, in a different status code. It was found in a live browser, not by a test.

**Decision.** `PushOutcome` gains `{ kind: "blocked"; status }`. The pusher stops (no retry), keeps the
queue, calls `reportError`, and tells the user their changes are not saving.

**The rule**, stated once so the next status code doesn't need its own ADR: **retry only what waiting can
fix.** Offline, `5xx`, `429`, timeouts — waiting genuinely fixes those. A `4xx` that is not `401` or `429`
is a durable server judgement about this request; re-sending the identical bytes yields the identical
answer, forever. Retrying it is not resilience, it is a silent infinite loop.

**Consequence.** Special-casing `401`, then `403`, then the next one, is a pattern that should have been a
rule two specs ago. This is the generalization.

## ADR-006 — Surface dropped wire fields; do NOT make schemas strict

**Context.** The client was silently stripping `shareToken` from every pull response. The server sent it;
`db.base` never had the key. Zod strips unknown keys by default, so there was no throw, no warning, no
failing test — the field just ceased to exist and the Copy-link feature quietly stopped working. The
proximate cause was environmental (a stale `.next` bundle predating commit `acc8f82`); the *failure mode*
is a code problem.

**Decision.** A dev-only key-diff in `pull()`: if the raw payload carries keys the parse discarded, report
it. **Not** `z.strictObject`.

**Why not strict.** Throwing on unknown keys would forbid the server from adding a field until every
client has updated — it converts a silent-drop bug into a hard-outage bug. The wire schemas must stay
additive and permissive (spec 16 relies on exactly that: `isOwner` and `shareToken` were both added as
optional, self-healing fields). We keep the permissiveness and remove only the *silence*.

**Why it matters.** This failure is invisible by construction. 25a's funnel reports `ZodError`s loudly
because a broken contract is always a bug — but **a strip is not an error**, so the funnel never sees it.
The only reason this was ever found is that a human noticed a missing button.
