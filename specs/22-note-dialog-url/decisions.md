# 22 · Note Dialog URL — Decisions

## ADR-001: Query param (`?note=<id>`) over intercepting-route path modal

### Context

The note dialog needs to be reflected in the URL so refresh, Back/Forward, and shared/bookmarked links
reopen it. Two idiomatic Next.js options exist.

### Options Considered

1. **Query param `/dashboard?note=<id>`** — dialog state lives in the existing search params.
   Reuses the `notes/[id]` → `?note=` redirect and the param plumbing already in `dashboard/page.tsx`.
   Refresh reopens; Back closes. One file changed. — *smallest diff, no new render path.*
2. **Parallel + intercepting routes `/notes/<id>`** — `@modal` slot + `(.)notes/[id]` intercept show
   the dialog on soft-nav and the full page on hard-nav. Cleaner URLs, canonical Next pattern — but
   several new route files, a real full-page fallback to maintain, and two render paths for one editor.

### Decision

Option 1 (query param). The dialog is a dashboard concern, the redirect already targets
`?note=`, and it's a fraction of the code with no duplicated editor render path.

### Consequences

- The open note is `searchParams.get("note")` — the URL is the single source of truth; local
  `dialogNoteId` state is removed.
- URLs are `/dashboard?note=<id>` rather than `/notes/<id>`. If clean path URLs become a requirement,
  migrate to intercepting routes later (future-work) — the redirect can point either way.
- `creating`/`createdId` stay local `useState` (instant-create shell + `assumeEditable` predate the id
  and aren't URL-derivable).
