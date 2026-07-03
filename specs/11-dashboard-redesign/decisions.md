# 11 · Dashboard Redesign — Decisions

## ADR-001: Note dialog reuses `Editor` + `ShareDialog` instead of a new minimal editor

### Context
The design opens notes (new and existing) in a dialog that shows the note's content and access
settings. The app already has a working collaborative editor (`apps/web/app/notes/[id]/Editor.tsx`,
CRDT via Hocuspocus) and an owner sharing control (`ShareDialog.tsx`, wired to `useShareNote` /
`useMakePrivate`).

### Options Considered
1. **Reuse `Editor` + `ShareDialog` inside a shadcn `Dialog`** — shows real content and real
   settings, minimal new code; opens a WebSocket per dialog-open.
2. **New throwaway placeholder editor** (plain textarea) — simplest UI, but shows no real content
   and duplicates a second editor surface.

### Decision
Option 1. "Editor is future work" means *don't build new rich-editing UI*, not *fake the content*.
Reuse gives real content + real sharing with the least code.

### Consequences
- The dialog body must fully unmount `Editor` on close (provider destroys on unmount); key by
  `noteId`.
- `/notes/[id]` route stays for share/deep links; the dialog is only the in-dashboard open flow.

## ADR-002: Add real backend fields (`access`, `ownerName`) rather than placeholder UI

### Context
The minimal card needs a Public/Private badge (owned) and an owner label ("Jessica's note",
shared). `GET /api/notes` (owned) returns no `access`. `GET /api/notes/shared` already returns
`access` but no owner name. `noteAccessSchema` = `private | view | edit` (no `none`).

### Options Considered
1. **Add `access` to owned summaries + `ownerName` to shared summaries** (schema + api query).
2. **Frontend placeholder** — static "Private" badge + generic "Shared note" label, wire later.

### Decision
Option 1. `note.access` is already on the row and `user.name` is a cheap join; the badge/label
should reflect real state. Contracts live in `@yapper/schemas`.

### Consequences
- `noteSummarySchema` += `access`; `sharedNoteSummarySchema` += `ownerName`; update `note.test.ts`.
- Shared-list query joins the owner; select only `user.name` (never `credential.key` / CRDT blob).
- Owned badge: `private` → Private, `view`/`edit` → Public. Shared badge: `view` → View only,
  `edit` → Edit. The shared list filters out `private`, so the mockup's "Access revoked" card is
  not reachable and is deferred (see future-work.md).

## ADR-003: Consume existing theme tokens; no `globals.css` re-theme

### Context
User chose to "adopt the design palette globally." Inspection showed `globals.css` already defines
the design's palette (`--color-ink/panel/panel-2/fg/brand/cream/ablue/aorange/agreen/danger`) and
the `.dark` theme maps `--primary → cream`, `--card → panel`, etc.

### Decision
Build the dashboard on semantic shadcn tokens. No token-value edits — the global palette already
is the design.

### Consequences
- Zero blast radius on login/editor from a "global" retheme.
- Dashboard also renders in light mode via the existing toggle (dark matches the mockup).

## ADR-004: lucide-react, not react-icons

### Context
The mockup uses Material Symbols. Initial plan proposed react-icons; `lucide-react` is already
installed and used by shadcn.

### Decision
Use `lucide-react`. Avoids a new dependency and matches shadcn conventions.

### Consequences
- Icon glyphs approximate (not identical to) the Material Symbols in the mockup.
