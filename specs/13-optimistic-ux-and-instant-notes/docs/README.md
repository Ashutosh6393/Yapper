# Optimistic UX & Instant Notes

## Overview

Perceived-performance polish for the Yapper dashboard: note/label actions apply instantly
(optimistic, with rollback on failure), events surface as toasts (with Undo on reversible actions),
the refresh control shows real state, a brand-new note opens instantly and is typable before the
network settles, and notes tile in a Pinterest-style masonry grid.

_Screenshots added when the feature is complete (see `prompts.md` → Generate Docs with Screenshots)._

## How to Use

### Instant actions
Archive / trash / restore / delete-forever and label edits update the grid immediately. On a server
error the change rolls back and an error toast explains what happened.

### Undo
Trash and Archive raise a success toast with an **Undo** button that restores the note instantly.

### Refresh
The top-bar refresh icon has a "Refresh notes" tooltip, spins while refreshing, and toasts "Notes up
to date" when done.

### New note
Click **New note** (or the "Start a new note…" field) — the editor opens at once and you can type
immediately; saving/sync happens in the background.

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| Toaster position | `sonner` `<Toaster />` placement | bottom-right |
| Masonry columns | responsive `columns-*` breakpoints | 1 / 2 / 3 / 4 |

## FAQ

### Is optimistic editing on a new note safe?
Yes. The socket enforces read-only server-side; client-side editability is UX only. If the server
resolves a lower permission the editor downgrades to read-only and toasts.

### Why can within-row card order differ from newest-first?
The masonry uses CSS `columns`, which fills column-by-column. Strict DOM-order masonry is future-work.
