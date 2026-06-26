# 04 · Editor & Realtime — Future Work

## Enhancements
- Richer editor (images, code blocks, tables, slash menu).
- Offline editing + IndexedDB persistence (`y-indexeddb`) with later sync.
- Named version snapshots / history.

## Technical Debt
- Debounce window means a small data-loss exposure on hard crash; tune + flush-on-disconnect.
- JWT refresh-on-reconnect needs hardening once tokens are short-lived.

## Nice to Have
- Word count / reading time from derived text.
- Autosave indicator + "saved" toast.
