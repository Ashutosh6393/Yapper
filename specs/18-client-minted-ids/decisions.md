# 18 · Client-minted note IDs & idempotent create — Decisions

Governing decision: **`docs/adr/0006-client-minted-note-ids-idempotent-create.md`** (Accepted). The client
mints the note id (`crypto.randomUUID()`); the server accepts it via an idempotent
`INSERT … ON CONFLICT (id) DO NOTHING`, validates it is a well-formed UUID, and rejects a create whose id
belongs to another user. This file records only the **spec-local** implementation choices; it does not
restate the ADR.

## ADR-18-01: Server create semantics live in a reusable `createNoteRecord` helper

### Context

ADR-0006 says the create logic is shared by two callers — the legacy `POST /api/notes` (flag-off) and the
`/api/sync/push` `createNote` server mutator (flag-on, spec 19). The idempotent insert + owner-on-conflict
check must be identical in both, and this spec builds **before** spec 19's push router exists.

### Options Considered

1. Inline the SQL in the `POST /api/notes` handler now, copy it into spec 19's push mutator later — two
   copies of the create/idempotency/owner-check logic that can drift.
2. Extract a `createNoteRecord(userId, id)` helper in `apps/api/src/notes/create.ts` returning a
   discriminated result (`created | exists | conflict`); both routes call it.

### Decision

Option 2. A single `createNoteRecord` owns validate → idempotent-insert → owner-on-conflict and returns a
typed union the caller maps to HTTP status (legacy) or a push verdict (spec 19). Spec 18 wires it into the
existing `POST /api/notes`; spec 19 imports the same function. One source of the create semantics.

### Consequences

- No duplicated create SQL; the owner-on-conflict fail-safe is defined once.
- Spec 19's coordination surface is a plain function import, not a re-implementation.
- The helper is unit-testable directly and via supertest through the legacy route in this slice.

## ADR-18-02: Client id is an additive **optional** field; response keeps echoing the id

### Context

Changing `POST /api/notes` must not break the flag-off web path, which today POSTs an empty body and reads
`id` from the response. The whole engine is gated behind `NEXT_PUBLIC_SYNC_ENGINE`.

### Options Considered

1. Hard-swap: make `id` required and drop the response id now — cleanest end state, but breaks every
   flag-off client immediately and couples this slice to spec 19's flag flip.
2. Additive: `id` is **optional**. Absent → server-generates (today's `defaultRandom()` path), response
   still returns the row; present → idempotent client-id path. Retire the echo when spec 19 flips the flag.

### Decision

Option 2. Absent-id keeps byte-for-byte current behavior; present-but-malformed id → 422 (never coerced,
so a client can't silently key content by an id the server replaced); present-valid → `createNoteRecord`.
The "response no longer needs a new id" end state (ADR-0006) is reached in spec 19, not here.

### Consequences

- Flag-off create path is untouched; the slice ships independently and safely.
- Small transitional cost: the response id echo lingers until spec 19's flip (documented in future-work).

## ADR-18-03: `createNote` args are minimal — `{ id }` only

### Context

The `createNote` arg shape (owned by this spec, consumed by spec 19's `mutationSchema`) could carry initial
`title`/`access`, or just the id.

### Options Considered

1. `{ id, title?, access? }` — lets a create seed a title/share level in one mutation.
2. `{ id }` — note is always created with server defaults (`Untitled` / `private`); title/access change via
   the existing `renameNote` / `setShareLevel` mutations and content-lane title derivation (spec 20).

### Decision

Option 2. It matches the current "create an owned note with defaults" behavior exactly, keeps the create
trivially idempotent and replayable offline, and avoids a second place that sets title/access. Extra fields
can be added to `createNoteArgsSchema` later without breaking the contract if a need appears (future-work).

### Consequences

- `createNoteArgsSchema = z.object({ id: z.string().uuid() })` — the smallest safe contract.
- A freshly created offline note shows "Untitled" until the user renames or types (title re-derived by the
  content lane) — consistent with today's server-generated create.
