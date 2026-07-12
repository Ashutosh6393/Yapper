# 22 · Note Dialog URL — Design

Open notes in the dashboard **modal** (already built on branch `feat/editor-toolbar`) but make the
**URL reflect the open note**. Today the dialog is driven by local `useState` (`dialogNoteId`) and the
`?note=<id>` param that share-joins / bookmarks arrive with is read once and **immediately stripped**
(`dashboard/page.tsx:109-117`), so the URL never shows the open note, and refresh / Back / paste-link
don't reopen it.

This spec makes `?note=<id>` on `/dashboard` the **single source of truth** for the dialog: the URL is
the state. No new routes, no new dependencies, no API/DB/socket/contract changes — **`apps/web` only**,
one file (`app/dashboard/page.tsx`) plus its test. The `notes/[id]` redirect and the `NoteDialog`
component are already correct and are untouched.

## Goal State (acceptance)

1. Clicking a note card (or the share-join / bookmark redirect) puts the note in the URL as
   `/dashboard?note=<id>` and the dialog opens on that note. Opening **preserves** any active
   `view` / `label` param.
2. Loading `/dashboard?note=<id>` directly — refresh, pasted link, or the `notes/[id]` →
   `?note=` redirect — opens the dialog from the param (no strip).
3. Closing the dialog (X / Esc / backdrop) removes **only** the `note` param, preserving `view`/`label`.
4. Browser **Back** after opening closes the dialog; **Forward** reopens it. Switching view/label
   while the dialog is open closes it.
5. Instant-create still works: New note opens the shell immediately; when the `POST` resolves the URL
   gets `?note=<newId>`, and the just-created note is editable-first (`assumeEditable`). A create
   failure clears the shell and error-toasts, leaving the URL clean.

## Scope

**In:** `app/dashboard/page.tsx` (dialog state ← URL, open/close via `router.push`, drop the strip
effect, keep `creating`/`createdId` local) and `app/dashboard/page.test.tsx` (goal-state tests first).

**Out / unchanged:** `notes/[id]/page.tsx` redirect, `components/dashboard/note-dialog.tsx`,
`Editor.tsx`, `share/[token]/page.tsx`, any API/DB/socket/Zod contract. No intercepting routes / path
modal (`/notes/<id>`) — deferred (see future-work).

## Design

**Dialog state = URL.** Replace the `dialogNoteId` `useState` with a derived read:

```ts
const dialogNoteId = searchParams.get("note");
```

**Delete the strip effect** (`dashboard/page.tsx:109-117`). It exists only to prevent the param from
reopening the dialog — which is now the desired behaviour.

**Open → push, merging into current params** (preserves view/label):

```ts
function openNote(id: string) {
  const params = new URLSearchParams(searchParams);
  params.set("note", id);
  router.push(`/dashboard?${params.toString()}`);
}
```

Card `onOpen={openNote}` and the create flow use this instead of `setDialogNoteId`.

**Close → push without `note`:**

```ts
function closeDialog() {
  setCreatedId(null);
  const params = new URLSearchParams(searchParams);
  params.delete("note");
  const qs = params.toString();
  router.push(qs ? `/dashboard?${qs}` : "/dashboard");
}
```

**Keep `creating` + `createdId` as local `useState`** — the instant-create shell (opens *before* an id
exists) and the `assumeEditable` marker aren't URL-derivable. On create resolve, call `openNote(id)`;
`assumeEditable` stays `dialogNoteId === createdId`.

`navigate()` / `selectLabel()` already `router.push` a fresh query string, which drops `note` and closes
the dialog — no change.

## Behaviour table

| Action | Result |
|---|---|
| Click note card | URL → `?note=id`, dialog opens |
| Refresh / paste link / share-join redirect | dialog opens from param |
| Close (X / Esc / backdrop) | `note` removed, `view`/`label` kept |
| Back after open | dialog closes |
| Switch view/label while open | dialog closes |
| New note | shell opens instantly → `?note=newId` on resolve; failure clears + toasts |

## Testing (TDD — goal-state test first)

`app/dashboard/page.test.tsx` — the existing harness already mocks `router.push` and a controllable
`useSearchParams`:

- clicking a card → `push` called with `/dashboard?note=act`
- opening preserves params: with `view=archive` set, open → `push` with `note` **and** `view=archive`
- render with `?note=act` → a `dialog` is in the document (deep-link / refresh)
- close → `push` called with `note` stripped, `view` preserved
- adapt the existing create / instant-create tests to assert the URL push rather than internal state

Green + `tsc --noEmit` + Biome before done. Run web tests from `apps/web` (`bunx vitest run
--maxWorkers=1`).
