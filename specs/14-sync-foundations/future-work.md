# 14 · Sync Foundations — Future Work

Ideas and enhancements deferred from the foundations. Items owned by a named sibling spec are listed
so nothing is silently dropped; genuinely open ideas are under Nice to Have.

## Owned by sibling specs (not future work — cross-reference only)
- `rebuild()` replay body + `db.notes` materialization + `useLiveQuery` selectors → **spec 15**.
- Client + server mutators; retiring `optimistic.ts` and `notes.ts` reads → **spec 19**.
- Client-minted note ids end-to-end + idempotent create → **spec 18**.
- Pusher + `/api/sync/push` + `lastMutationID` + `sync_client` table → **spec 19**.
- CVR puller + `/api/sync/pull` + `note.meta_version` + `sync_cvr` table → **spec 16**.
- SSE poke transport (`/api/sync/stream`, Redis `poke:user:{userId}`) → **spec 17**.
- Content lane (`PUT /api/notes/:id/content`, shared derive helper, private↔shared handoff) → **spec 20**.
- Rollback UX (transient vs permanent classification, revert toast) → **spec 21**.
- The final "delete the retired Query notes path" PR → **spec 19 / cutover** (only when the flag flips).

## Enhancements
- **Harden the `clientGroupID` first-mint tab race** with a Dexie transaction (currently benign
  last-write-wins; see design.md Risks). Fold into spec 15 if it ever surfaces.
- **Runtime flag toggle** (feature-flag service / per-user rollout) instead of a build-time env var,
  so the engine can be enabled for a cohort without a redeploy. Env var is fine for the build phase.
- **Contract versioning** on the push/pull envelope (a `v` field) if the wire format needs to evolve
  after the engine ships and old clients may still be in the wild.

## Technical Debt
- **`fake-indexeddb` in the web test setup** is a test-only dependency for the Dexie layer; keep it
  strictly out of the app bundle and revisit if a lighter mock suffices.
- **`rebuild()` throwing stub** is intentional debt until spec 15 replaces the body; the flag keeps it
  off the live path, but it's a symbol that must not be called before 15 lands.

## Nice to Have
- A tiny dev-only "sync engine on/off" indicator in the UI while the flag exists, so QA can see which
  path is live at a glance.
- A `packages/schemas` doc note listing the 14 canonical mutation names in one place for sibling
  authors to reference.
