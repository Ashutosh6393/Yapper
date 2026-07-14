# CLAUDE.md — 26 · Sync Identity

## Project Context

Sign-out leaves the whole local sync engine behind — the `clientGroupID`, the mutation queue, and every
note the previous user could read all survive in IndexedDB. That one omission causes a **privacy leak**
(the next user on the browser sees the previous user's notes), a **permanently jammed queue** (every push
`403`s on a stale client-group binding), and — because the `403` is classified *transient* — **total
silence** about both.

Found in a live browser, not by reading code: the queue was stuck at seq 58–60 with `lastMutationID: 57`,
every push returning `403 {"error":"Client group bound to another user"}`, while `rebuild()`'s optimistic
replay painted `access: "view"` over a base row that said `private`. The UI was lying and nothing said so.

Four slices: **26a** wipe on sign-out (the privacy bug — ship first), **26b** identity scoping + a server
that fails consistently, **26c** a `blocked` push outcome (the reason nobody noticed), **26d** dev-only
visibility for silently-dropped wire fields.

> **Stacks on PR #51 (spec 25).** 26c extends the `PushOutcome` union from 25b. Merge #51 first.

## Before Starting Work

1. Read `specs/26-sync-identity/design.md` — especially "Found in a live browser" and "The gaps,
   root-caused".
2. Read `decisions.md` — ADR-005 ("retry only what waiting can fix") is the rule the whole spec turns on.
3. Check `implementation.md` for progress.
4. Read the code: `apps/web/lib/sync/db.ts` (`getClientGroupID`, `rebuild`), `apps/web/lib/sync/classify.ts`
   + `push.ts` (the outcome taxonomy from 25b), `apps/web/app/dashboard/page.tsx:253` (`signOut`),
   `apps/api/src/sync/push.ts:92` (the binding check) and `apps/api/src/sync/pull.ts` (which lacks it).

## Code Patterns

- **Test-first** (repo rule). Goal-state test per slice — see the table in design.md.
- Web tests: `bunx vitest run --no-file-parallelism` from `apps/web` (the full suite OOMs on a parallel
  run; `--maxWorkers=1` *alone* errors out). API tests: `bun test` from `apps/api`.
- Reuse the existing outcome plumbing — `classify` → `PushOutcome` → `push.ts` — rather than adding a
  second error channel. `blocked` is a new variant, not a new mechanism.
- Strict TS, no `as any`. Biome from the repo root.

## Don't

- **Don't wipe the queue without telling the user.** A non-empty `db.mutations` at sign-out is unsaved
  writing: flush first, and if it can't flush, make them confirm the discard (ADR-002). This spec is about
  data the app forgot it was holding — do not "fix" it by silently deleting more.
- **Don't schedule a retry for a `blocked` outcome.** Waiting cannot fix a `403`. That is the entire bug.
- **Don't special-case the next status code.** Apply ADR-005's rule: retry only what waiting can fix.
  `4xx` (except `401`/`429`) is a durable server judgement.
- **Don't make the wire schemas strict** (`z.strictObject`). It would forbid the server adding a field
  before every client updates — a silent-drop bug becomes a hard-outage bug. Spec 16 deliberately added
  `isOwner`/`shareToken` as optional, self-healing fields. Keep them permissive; remove only the silence.
- **Don't add a dependency** — no contract-testing framework, no schema registry.
- **Don't run `next build` in `apps/web` while a dev server is running.** It writes to the same `.next`
  directory and leaves the dev server serving stale chunks — that is what masked Gap 4 during diagnosis.
- Don't add features not in design.md.
