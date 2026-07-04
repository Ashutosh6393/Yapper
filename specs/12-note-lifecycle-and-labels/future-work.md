# 12 · Note Lifecycle & Labels — Future Work

Deferred deliberately (see decisions.md for context):

- **Socket disconnect on trash** — publish a revoke event on `POST /:id/trash` so already-connected
  collaborators are kicked immediately (like make-private), instead of only being blocked on their
  next read/reconnect (ADR-005).
- **Label rename** — `PATCH /api/labels/:id { name?, color? }` + inline rename UI. This spec is
  create/attach/detach/delete only (ADR-009).
- **Edit a label's color after creation** — color is fixed at create time for now (ADR-003).
- **Label shared notes with your own labels** — per-user labels on notes you don't own; makes
  `note_label` viewer-dependent (ADR-002).
- **Leave a shared note** — a collaborator removing a note from their "Shared with me" (delete their
  own collaborator row); distinct from owner archive/trash (Q4).
- **External / serverless purge trigger** — protected `POST /api/internal/purge-trash` + external
  scheduler (Upstash QStash / cron-job.org), for when `api` goes serverless/scale-to-zero (ADR-008).
- **Hard-24h purge precision** — run more frequently (or schedule per-note) instead of the current
  ~24–25h worst case.
- **Bulk lifecycle actions** — multi-select archive/trash/restore; "Empty Trash" button; "Restore
  all".
- **Server-side search** across views (search is client-side, view-scoped for now).
- **Sidebar label counts of archived/trashed** — counts + filter currently include active notes only
  (Q17).
- **Trashed note read-only preview** — trash cards are non-openable now; a read-only peek could help
  users decide restore vs delete.
