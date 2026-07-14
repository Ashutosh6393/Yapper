# 26 · Sync Identity — Design

> **Stacks on PR #51 (spec 25).** 26c extends the `PushOutcome` union that spec 25b introduced. Branch is
> cut from `feat/frontend-hardening`; merge #51 first.

Sign-out leaves the entire local sync engine behind. The `clientGroupID`, the mutation queue, and **every
note the previous user could read** all survive in IndexedDB, because `signOut`
(`apps/web/app/dashboard/page.tsx:253-257`) clears the persisted session and nothing else.

That single omission causes a privacy leak, a permanently jammed mutation queue, and — because the
resulting failure is classified *transient* — total silence about both.

## Found in a live browser, not by reading code

This spec is not speculative. Every claim below was observed in the running app.

`db.sync` held a `clientGroupID` bound to a **different user**. So every `POST /api/sync/push` returned:

```
403 {"error":"Client group bound to another user"}        (apps/api/src/sync/push.ts:92)
```

`db.mutations` had been stuck at **seq 58, 59, 60** with `lastMutationID: 57`. Three `setShareLevel`
mutations, none of them ever applied. The queue had been dead for an unknown length of time and **nothing
in the app said so** — not a toast, not a console line, not a badge.

The app looked healthy because `rebuild()` replays the queue optimistically over `db.base`. The note
rendered as `access: "view"` ("Public" on the card) while the authoritative base row said
`access: "private", shareToken: null`. **The UI was painting a lie over the server's actual state**, and
would have kept doing so forever.

The only symptom the user ever noticed was a missing **Copy link** button — because the share token is the
one thing the client *cannot* fabricate optimistically. It only ever arrives from the server. It was the
honest field in a lying UI, and it is what finally surfaced the bug.

## The gaps, root-caused

### Gap 1 — sign-out leaves the previous user's notes on the device (privacy)

`signOut` clears `localStorage` (`clearPersistedSession()`) and calls Better Auth. It never touches Dexie.
So `db.notes`, `db.base`, `db.mutations` and `db.sync` all persist across a user switch on a shared
browser.

The dashboard reads `db.notes` through `useLiveQuery`, which renders **immediately on mount** — before any
pull can correct it. So the next user to sign in on that browser sees the previous user's note titles and
previews. Offline, indefinitely: the pull that would overwrite them never runs.

This is not a sync bug. It is user data belonging to person A, rendered to person B.

### Gap 2 — `clientGroupID` outlives the user, so the queue jams forever

`getClientGroupID()` (`apps/web/lib/sync/db.ts:65`) mints one id per **browser** and persists it in
`db.sync`. The server binds that id to a `userId` on first use and enforces the binding on every push
(`push.ts:92`). Nothing on the client ever re-mints it.

A different user signs in on that browser → the id is still bound to the previous user → **every push
`403`s, permanently.** Every mutation the new user makes — share, rename, archive, label — queues locally
and never lands.

**The server enforces this asymmetrically**, which is why it presents as a half-working app rather than an
obvious break: `push` checks the binding, `pull` (`apps/api/src/sync/pull.ts`) **does not** — it just
serves `authorizedNotes(userId)` for whoever is authenticated. So reads keep working perfectly while every
write is rejected. A loud failure would have been far kinder than this.

### Gap 3 — `403` retries forever, silently (the ADR-003 hole, still open)

Spec 25b gave `401` its own `auth` outcome, because retrying cannot mint a new session. **A `403` is in
exactly the same position and was left in the transient bucket.** `classify.ts` treats every non-`401`
failure as transient, and `backoff.ts` has deliberately no max-attempts.

So a permanently-bound client group is retried, at a 30s cap, until the tab closes. Nothing is reported —
25a's funnel never sees it, because the pusher swallows transient outcomes by design (silence is *correct*
for offline).

Retrying forever is right for offline, because waiting fixes it. **Waiting does not fix a `403`.** The
taxonomy is still missing a category: *permanently blocked* — the queue is fine, the session is fine, but
the server will never accept this push.

### Gap 4 — a dropped wire field fails completely silently

While diagnosing the above, the client was found to be **stripping `shareToken` out of every pull
response**. The server sent it; `db.base` never had the key.

The proximate cause was environmental (a stale `.next` bundle predating commit `acc8f82`, which added the
field — cleared by restarting the dev server) and needs no code fix. **The failure *mode* does.**

Zod strips unknown keys by default. A client whose schema is behind the server's does not throw, does not
warn, and does not fail a test — the field silently ceases to exist and the feature that depends on it
silently stops working. Spec 25a reports `ZodError`s loudly precisely because a broken contract is always
a bug, but **a strip is not an error**, so nothing catches it.

Note the shape of this: it is *invisible by construction*. The only reason it was found is that a human
noticed a missing button.

### Gap 5 — the owner waits for a pub/sub round-trip to see their own share link

Observed after the above was fixed: the Copy-link button appears, but **visibly late** — not on click.

The share token is minted server-side and is the one field the client cannot fabricate optimistically
(`access-control.tsx:45-47`). On the engine path it therefore arrives only via a pull, and the only thing
that triggers that pull is the SSE poke. So the owner's own link travels:

```
click → push → server mints token → publishPokes → Redis → SSE → 300ms coalesce (poke.ts:19) → pull → rebuild → button
```

The user who *made* the change is waiting on a **fanout designed to notify other people**. And because the
publisher is null-tolerant (`REDIS_URL` optional, `publishPokes` no-ops when unset), the owner's own
share link silently never appears at all on a deployment without Redis.

The pusher already knows the server accepted the mutations — that is exactly what a `settled` outcome
means. It does not need to be told by Redis.

## Goal State (acceptance)

1. **Sign-out leaves nothing behind.** After sign-out, `yapper-sync` (Dexie) and the y-indexeddb note docs
   are gone. A second user signing in on the same browser sees an empty dashboard until their own pull
   lands — never the previous user's notes, online or offline.
2. **Sign-out never silently discards unsynced work.** With a non-empty `db.mutations`, sign-out first
   attempts a flush; if it cannot (offline / failing), the user is told what is unsaved and must confirm.
3. **A new user gets a new client group.** Even if the wipe is skipped (crash, force-quit, a wipe that
   fails), the `clientGroupID` is re-minted when the signed-in user differs from the one it was minted
   for. Pushes cannot `403` on a stale binding.
4. **The server fails loudly and consistently.** `POST /api/sync/pull` enforces the same client-group
   binding as push. A mismatched group is a `403` on *both*, not a working read and a rejected write.
5. **A blocked push says so.** A `403` (and any other permanently-unacceptable push) stops the pusher
   instead of retrying forever, reports through `reportError`, and tells the user their changes are not
   saving. The queue is preserved.
6. **A silently-dropped wire field is visible in dev.** When a pull response carries keys the client's
   schema discards, that is surfaced (dev only), instead of a feature quietly ceasing to exist.
7. **The owner sees their own share link immediately.** Setting a note to view/edit surfaces the Copy-link
   button without waiting for an SSE poke — and it works with `REDIS_URL` unset.

## Design

### 26a — sign-out wipes the local engine

`signOut` becomes: flush → confirm-if-blocked → **wipe** → sign out.

```
if (db.mutations is non-empty) {
  try to push();
  if (still non-empty) → confirm dialog: "N changes haven't synced. Sign out and discard them?"
}
await db.delete();          // the whole yapper-sync database
await clearNoteDocs();      // y-indexeddb doc stores (note content)
```

Wiping is the *primary* fix for Gap 2 as well: a fresh Dexie mints a fresh `clientGroupID` on next login,
so the binding can never be stale. Gap 1 and Gap 2 have the same root and the same one-line cure.

The confirm step exists because the wipe is destructive and the queue is the user's unsaved writing. This
spec's whole subject is data the app forgot it was holding; it must not fix that by *deleting* data the
user still wants. Same principle as ADR-003 (never `signOut()` on a `401`), applied in the other
direction.

### 26b — client group scoped to the user, and a server that fails consistently

**Client (defence in depth).** Store the minting user alongside the id and re-mint on mismatch:

```ts
// db.sync: { key: "clientGroupID", value: id, userId }
export async function getClientGroupID(userId: string): Promise<string>
```

26a's wipe should mean this never fires. It fires anyway when the wipe didn't happen — a crash mid
sign-out, a force-quit, a browser that killed the tab. **Cheap, and the failure it prevents is
permanent-and-silent**, which is the class of bug worth paying ten lines to make impossible.

**Server (fail loud).** `handlePull` gains the same binding check `handlePush` already has. A stale group
then breaks *immediately and obviously* rather than presenting as an app where reads work and writes
vanish. The asymmetry is what let this hide.

### 26c — the push taxonomy gains a permanent outcome

Generalizes ADR-003 rather than special-casing another status:

```ts
type PushOutcome =
  | { kind: "settled"; rejected: RejectedMutation[] }
  | { kind: "transient" }                        // offline, 5xx, 429, timeout — waiting fixes it
  | { kind: "auth" }                             // 401 — the session is dead (25b)
  | { kind: "blocked"; status: number };         // 4xx — the server will never accept this push
```

`blocked` → **stop the pusher** (no `scheduleRetry` — waiting cannot fix it), **keep the queue**,
`reportError` (this is always a bug: a client/server disagreement), and tell the user their changes are
not saving.

The rule, stated once so the next status code doesn't need its own ADR: **retry only what waiting can
fix.** Offline, `5xx`, `429`, timeouts — wait. A `4xx` that isn't `401` or `429` means the server has made
a durable judgement about this request, and re-sending the identical bytes will produce the identical
answer, forever.

### 26d — surface dropped wire fields (dev only)

In `pull()`, dev-only, compare the raw payload's keys against the parsed result and log the difference
through `reportError`:

```ts
// ponytail: dev-only key-diff, ~5 lines. Not a schema-drift framework.
```

**Explicitly not** `z.strictObject`. Making the client throw on unknown keys would forbid the server from
ever adding a field before every client updates — it converts a silent-drop bug into a hard-outage bug,
which is worse. The wire schemas stay additive and permissive; we just stop being *silent* about the
drops.

### 26e — pull immediately after a settled push

Two lines in `push.ts`: after a `settled` outcome, `void pull()`.

A `settled` outcome *is* the server's confirmation that the mutations were applied. The pusher already
holds the fact that the poke exists to deliver. Pulling straight away closes the loop locally, and takes
Redis off the critical path for the actor's own change — the fanout keeps doing its real job, which is
notifying *everyone else*.

This is a latency fix, not a correctness one — but on a Redis-less deployment it is the difference between
a share link that appears late and one that never appears at all.

**Not** "return the token in the push response." That would make the generic push envelope carry a
mutation-specific payload, coupling every future mutation's result shape into it. A pull is the existing
mechanism for "bring the server's truth down," and it already handles every field, not just this one.

## Non-goals

- **No new dependency.** No `zod-to-json-schema`, no contract-testing framework, no schema registry.
- **No strict/no-unknown-keys wire schemas** — see above; forward compatibility is worth more.
- **Not fixing `.next` cache staleness.** Gap 4's proximate cause was environmental (a production
  `next build` run against a live dev server's `.next`). The code fix here is only about *visibility*.
- **No sign-out-time content sync.** Flushing the metadata queue is in scope; forcing a Yjs content sync
  is not (y-indexeddb + Hocuspocus own that, and content is already durable locally).

## Slices → PRs

| Slice | Contents | Test |
|-------|----------|------|
| **26a — wipe on sign-out** ⚠️ *privacy* | flush-or-confirm, `db.delete()`, clear y-indexeddb docs, in `dashboard/page.tsx` + a `lib/sync/reset.ts` | a seeded Dexie is empty after sign-out; a non-empty queue prompts |
| **26b — identity** | `getClientGroupID(userId)` re-mints on mismatch; `handlePull` enforces the binding | re-mint on a different user; pull `403`s on a foreign group |
| **26c — blocked pushes** | `{ kind: "blocked" }` in `classify`, pusher stops + reports + banner | `classify` → `blocked` for `403`; pusher schedules no retry and keeps the queue |
| **26d — drift visibility** | dev-only dropped-key diff in `pull()` | a payload with an unknown key logs; a clean one doesn't |
| **26e — pull after settled push** | `void pull()` on a `settled` outcome in `push.ts` | a settled push triggers a pull; a transient one doesn't |

**Ship 26a first — it is the privacy bug.** 26c is second: it is the reason nobody noticed any of this for
however long it was broken, and it makes every future recurrence loud instead of silent. **26e is two
lines** and can ride along with anything.
