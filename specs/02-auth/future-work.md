# 02 · Auth — Future Work

## Enhancements
- Additional providers (email magic link, more OAuth) if needed.
- Account linking (same email across Google/GitHub).
- Rate limiting on auth routes.

## Technical Debt
- Dev cookies run over http (sameSite/secure relaxed); tighten for prod.
- JWT refresh strategy on the web client is minimal; revisit token TTL with socket usage (slice 04).

## Nice to Have
- "Remember me" / session length config.
- Profile page (name/avatar) — name/color already used for cursors in slice 05.
