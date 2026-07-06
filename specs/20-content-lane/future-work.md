# 20 · Content Lane — Future Work

Deferred from spec 20. Not correctness gaps.

- **Failed-flush classification (transient vs permanent).** A rejected `PUT /content` (offline/5xx vs a
  permanent 4xx) should be classified and surfaced like metadata pushes (ADR-0009). Spec 20 queues/
  retries transient failures; wiring content flushes into **spec 21**'s transient-vs-permanent toast is
  deferred.
- **Incremental / binary content transport.** Full-state base64-in-JSON adds ~33% overhead (ADR-001).
  If docs grow large, revisit with `application/octet-stream` (raw bytes) or incremental Yjs updates
  with server-side merge.
- **Content-flush debounce tuning.** The debounce interval is a fixed spec-local choice; adaptive
  debounce (longer while typing fast, flush on idle/blur/unmount) can reduce writes further.
- **Private-note cross-device realtime.** Cross-device propagation of private content currently rides the
  metadata pull + poke (title/preview) plus a re-fetch of `note_doc` on open; true realtime private
  co-editing across a user's own devices without Hocuspocus is out of scope.
- **`y-indexeddb` eviction / size management.** Local IndexedDB content accumulates; a cleanup policy for
  large/old local docs (and `clearData()` on note delete) beyond the basic `destroy()` on unmount is
  deferred.
- **Derive-vs-rename precedence.** The final rule for a content re-derive overwriting a manual
  `renameNote` title (spec 19 ADR-005) is settled jointly with this spec when both land.
- **Handoff race hardening.** The zero-overlap handoff is sequenced + tested; a stronger lock (e.g. a
  short server-side writer lease on `note_doc`) could make overlap impossible rather than merely
  tolerated — deferred as unnecessary given CRDT convergence.
