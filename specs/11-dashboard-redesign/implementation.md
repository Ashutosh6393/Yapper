# 11 · Dashboard Redesign — Implementation

## Status: in-progress

## Completed
- **Task 1** — `@yapper/schemas`: `access` added to `noteSummarySchema` (base), `ownerName` added to
  `sharedNoteSummarySchema`. Tests red→green (9 pass). Committed.
- **Task 2** — `apps/api`: `GET /` owned list now returns `access`; `GET /shared` joins `user` and
  returns `ownerName` (name only — no other user columns). Tests red→green (13 pass). Committed.

## In Progress

## Blocked

## Next Steps
1. Extend `@yapper/schemas` note schemas (+`access`, +`ownerName`) and `note.test.ts` — red → green.
2. Update `apps/api` owned-list (return `access`) and shared-list (join owner → `ownerName`).
3. Add shadcn `dialog` + `dropdown-menu` to `apps/web/components/ui`.
4. Build dashboard shell + sidebar + top bar (search / refresh / avatar dropdown).
5. Build note sections + minimal cards (badge, shared owner line, revoked state) + ⋮ delete menu.
6. Wire live search across both sections.
7. Build note dialog wrapping reused `Editor` + `ShareDialog`; wire New Note / Start-a-note / card
   click.
8. Dashboard Vitest component test for the goal state.

## Session Notes

### 2026-07-03
- Spec written (design.md, decisions.md, CLAUDE.md, future-work.md). Branch: `feat/dashboard-redesign`.
- Key decisions: reuse `Editor`+`ShareDialog` in the dialog (ADR-001); add real `access`/`ownerName`
  fields (ADR-002); consume existing theme tokens, no `globals.css` change (ADR-003); lucide-react
  (ADR-004).
- Spec reviewed and approved. Implementation plan written to `plan.md` (10 tasks, TDD, bite-sized).
- Next: execute the plan task-by-task (see `plan.md`).
