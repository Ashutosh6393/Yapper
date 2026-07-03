# 11 · Dashboard Redesign — Future Work

Ideas and enhancements deferred from this slice.

## Enhancements
- **Revoked shared card:** the mockup's greyed "Access revoked — note made private by owner" card.
  Not reachable today because `/api/notes/shared` filters out `access: private`; would need the
  endpoint to also surface recently-revoked collaborations.
- **Live presence on cards:** "Live · N editing" badges and collaborator avatar stacks on note
  cards; requires a presence/collaborator-count source (awareness aggregation or a metadata field).
- **Sidebar "Online now":** real online-collaborators list (dropped from this slice's UI).
- **Archive & Trash:** functional archive/trash flows behind the sidebar nav items (currently
  visual only).
- **Rich note editor:** formatting toolbar and editor features inside the note dialog (the dialog
  reuses the existing `Editor` as-is for now).
- **Server-side search:** move search to an API query for large note sets (currently client-side
  over the loaded lists).
- **Floating dock:** the design's bottom quick-action dock (dropped for now).
- **Quick-compose actions:** checklist/image/link entry from the "Start a new note…" bar (kept
  minimal for now).

## Technical Debt
- Dialog reopens a Hocuspocus WebSocket on each open; consider provider reuse/caching if churn
  matters.

## Nice to Have
- react-icons / Material Symbols parity with the mockup glyphs (using lucide-react for now).
- Masonry column layout tuning to match the mockup's responsive breakpoints exactly.
