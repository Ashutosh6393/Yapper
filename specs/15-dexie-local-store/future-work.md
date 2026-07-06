# 15 · Dexie Local Store — Future Work

Deferred from spec 15. Not correctness gaps — scope kept to the read path + materialization.

- **Local Shared-with-me view** — serving "Shared with me" from `db.notes` needs an additive `owner`
  field on the CVR base rows (owned by spec 16). Until then it stays on the `useSharedNotes` Query path
  in both flag states (ADR-003).
- **Sorted/paginated selectors** — the list currently materializes and the components sort by
  `updatedAt`. If lists grow, add `.reverse().sortBy("updatedAt")` in the selector and/or windowing;
  the `updatedAt`/`*labelIds` indexes are already in place for it.
- **Incremental materialization** — the full clear + `bulkPut` recompute is deliberate (ADR-001). If
  profiling ever shows it matters at scale, a touched-rows incremental `rebuild()` could replace it —
  but only with a determinism-preserving design.
- **Cross-tab rebuild coordination** — every tab runs its own `rebuild()`; Dexie's IndexedDB observation
  already keeps `db.notes` consistent across tabs, but a leader could avoid redundant recomputes.
- **Search over local data** — today search is client-side over the fetched list; once `db.notes` is the
  source, a Dexie index-backed search could replace it (currently out of scope).
