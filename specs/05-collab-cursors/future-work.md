# 05 · Collaboration & Cursors — Future Work

## Enhancements
- Follow-mode (jump to a collaborator's cursor).
- Avatars in presence list; "X is typing" affordances.
- Per-note color reassignment if collisions are visually close.

## Technical Debt
- Two-instance fanout is validated manually; add an automated integration test.
- Channel-naming convention is documented, not enforced by a shared constant — extract to `@yapper/*`.

## Nice to Have
- Idle/away presence states.
- Selection-based comments (threads) — larger future feature.
