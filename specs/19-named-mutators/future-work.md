# 19 · Named, Asymmetric Mutators — Future Work

Deferred from spec 19. Not correctness gaps.

- **Deleting the retired Query path** — `apps/web/lib/queries/optimistic.ts` and the lifecycle/label/
  share Query mutation hooks + note-read hooks are removed at the **final cutover** (when the flag
  flips), per spec 14's retirement plan — a single "remove dead Query notes path" PR, not part of this
  spec.
- **Batch/debounce of the pusher** — spec 19 ships a single-in-flight pusher nudged on enqueue; the
  backoff/retry scheduling is spec 21. Smarter batching (coalesce a burst of enqueues into one push
  body beyond the natural single-in-flight) can come later.
- **Derive-vs-rename precedence** — the final rule for a content edit re-deriving over a manual
  `renameNote` title is settled with spec 20 (ADR-005 here notes the open question).
- **Cross-tab pusher election** — each tab runs its own pusher; a BroadcastChannel leader (shared with
  spec 17's SSE / spec 16's pull sharing) could serialize pushes per browser to reduce redundant
  round-trips.
- **Server mutator observability** — structured logging/metrics on verdicts (applied vs rejected-by-
  reason) to spot clients emitting many rejects (e.g. a stale permission cache).
- **Optimistic label `noteCount` accuracy** — client mutators adjust counts best-effort; the pull is the
  source of truth. A more precise local count model is deferred.
- **Additional mutations** — any future metadata action (e.g. reorder, pin) is an additive `mutationName`
  + a client/server mutator pair; the framework is designed to extend by adding a keyed pair.
