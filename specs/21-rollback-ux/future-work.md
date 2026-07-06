# 21 · Rollback UX — Future Work

Deferred from spec 21. None of these are correctness gaps; they are UX polish or scale concerns beyond
the ADR-0009 goal state.

- **Offline detection UX** — a global "You're offline" banner / connectivity indicator. ADR-0009
  mandates *silence* for transient failures; a visible offline state is a separate, opt-in concern (it
  should read `navigator.onLine` + the pusher's pending state, not toast).
- **Toast de-duplication / coalescing** — a long offline session that accumulates several
  permanently-invalid mutations can emit several rejection toasts at reconnect. Sonner stacks them
  today; a coalesce/"3 changes couldn't be saved" summary policy is deferred.
- **Per-mutation "Retry now" affordance** — permanent rejects are dropped by design; a manual retry
  button (for the rare case a `forbidden` becomes allowed again) is out of scope.
- **Richer reason codes** — the enum is deliberately four codes. Finer-grained reasons (e.g.
  distinguishing "note trashed" from "note hard-deleted" within `conflict`/`not_found`) can be added
  later; they must stay additive to `pushRejectReasonSchema`.
- **Dependent-mutation cascade UX** — dropping a rejected `createNote` can orphan later mutations on the
  same id (each self-heals via `not_found` → drop+toast). A smarter "cascade drop dependents silently
  and show one toast" policy is deferred; today the queue self-heals and the user may see more than one
  toast.
- **Backoff telemetry** — surfacing retry counts / last-error to a debug panel for diagnosing stuck
  queues in the field.
- **Cross-tab retry coordination** — with multiple tabs, each runs its own backoff scheduler; a
  BroadcastChannel leader (shared with spec 17's SSE sharing) could serialize retries across tabs.
