# Auth Entry-Surface Redirect — Future Work

## Enhancements

- If auth ever moves to same-origin cookies, revisit server-side (middleware) gating for
  zero-flash redirects (see ADR-0001).

## Technical Debt

## Nice to Have

- Preserve a deep-link `returnTo` through the landing page too (currently only `/login` honors it).
