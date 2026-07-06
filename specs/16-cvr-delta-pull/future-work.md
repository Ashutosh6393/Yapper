# 16 · CVR Delta Pull — Future Work

Deferred from spec 16. Not correctness gaps.

- **CVR janitor** — pruning to the latest 1–2 cookies per client group happens on every pull, but
  abandoned client groups (a browser never returns) leave stale `sync_cvr` rows. A background sweep of
  client groups idle > N days is deferred (at Yapper's scale the accumulation is small).
- **Additive `owner` field on CVR base rows** — required to serve the Shared-with-me view from
  `db.notes` (spec 15 keeps it on Query until then). A small additive `NoteMeta`/pull extension; owned
  here when prioritized.
- **Delta compression / partial snapshots** — the jsonb CVR is rewritten whole each pull (ADR-001). If
  per-user note counts ever grow large, a compact/hashed CVR or a child-row store with server-side diff
  could reduce write amplification.
- **Pull coalescing across tabs** — each tab pulls independently; a BroadcastChannel leader (shared with
  spec 17's SSE sharing) could serialize pulls per browser.
- **Server-driven cursor for very large views** — if a single user's authorized set outgrows a
  one-shot pull, pagination/streaming of `puts` on a first/full resync.
- **Label delta for collaborators** — labels are the owner's private organization (`labelIds = []` for
  shared rows today); if shared-note labels are ever exposed, the CVR must carry them.
