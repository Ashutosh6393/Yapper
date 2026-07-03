# CLAUDE.md — 11 · Dashboard Redesign

## Project Context

Rebuild the `apps/web` dashboard to the imported Yapper Dashboard design: sidebar + top-bar shell,
minimal note cards in My Notes / Shared with Me sections, live client-side search, and a note
dialog that opens notes (new + existing) by reusing the existing `Editor` and `ShareDialog`.
Adds two real backend fields (`access` on owned summaries, `ownerName` on shared summaries).

## Before Starting Work

1. Read `specs/11-dashboard-redesign/design.md`.
2. Check `specs/11-dashboard-redesign/implementation.md` for current progress.
3. Read `decisions.md` for why the note dialog reuses `Editor`/`ShareDialog` and why backend
   fields were added.
4. Look at existing patterns in:
   - `apps/web/app/dashboard/page.tsx` (current dashboard, being replaced)
   - `apps/web/app/notes/[id]/Editor.tsx`, `ShareDialog.tsx` (reused inside the note dialog)
   - `apps/web/lib/queries/notes.ts` (all note queries/mutations already exist)
   - `apps/web/components/ui/*` + `theme-toggle.tsx` (shadcn + theming)
   - `packages/schemas/src/note.ts` + `note.test.ts` (contract source of truth)

## Code Patterns

- **Contracts:** update Zod schemas in `@yapper/schemas` first; derive types with `z.infer`.
  Never duplicate a shape per app. No `as any`.
- **Server vs client state:** TanStack Query owns notes data; `useState` owns search text + dialog
  open state. Don't put server data in local state beyond the search filter view.
- **Theme:** use semantic tokens (`bg-card`, `text-primary`, `border-border`,
  `text-muted-foreground`). Do **not** edit `globals.css` token values.
- **Icons:** `lucide-react` only.
- **Reuse:** the note dialog wraps the existing `Editor` (content) + `ShareDialog` (owner
  settings). Do not build a second editor.
- **TDD:** write the failing test first for each piece (schema, api, dashboard component).

## Don't

- Don't add features not in `design.md` (no presence/avatars, no Archive/Trash logic, no floating
  dock, no react-icons).
- Don't skip tests. Don't select `credential.key` or the CRDT blob in the `ownerName` join.
- Don't modify the `/notes/[id]` route or generated files.
- Don't re-theme `globals.css` — tokens already match the design.
