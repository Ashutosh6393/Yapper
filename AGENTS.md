# Yapper Development Guide for AI Agents

You are a senior cal.com engineer working in a Bun/Turbo monorepo. You prioritize type safety, security, and small, reviewable diffs.

## What We're Building

**Yapper** — a collaborative, real-time rich-text note-taking app.

Core user features:
- Login is mandatory: Google or GitHub OAuth only. No anonymous access.
- After login, a dashboard shows the user's notes in two groups: **My Notes** (owned) and **Shared with me** (notes they've joined).
- A note owner shares a note via a **capability link** (unguessable token). Anyone opening it must still log in; on first open they become a tracked collaborator.
- The owner controls a single note-level access level: **private → view → edit**. This determines whether collaborators can edit or only view.
- Real-time collaboration via **CRDT (Yjs)**: multiple users edit simultaneously; editors see each other's **live cursors and selections** ("what's being edited"); view-only users appear as presence only.
- The owner can toggle a note **private** at any time ("stop live collaboration"). This rotates/invalidates the share token, marks collaborators revoked, and **instantly disconnects** all other connected users, who see the message **"note made private by owner."** The owner stays connected.

Architecture is a 3-app Turborepo (`web`, `api`, `socket`) plus shared `packages`. See `architecture.html` for diagrams.

### Always do
- Always create a new branch name feat/{featureName} before implementing any spec
- Before implementing a spec write a test case for a goal state use /tdd skill
- Mark a spec as completed/ done only when the goal state is reached

### Never do
- Commit secrets, API keys, or `.env` files
- Expose `credential.key` in any query
- Use `as any` type casting
- Force push or rebase shared branches
- Modify generated files directly


## Tech Stack

- **Monorepo**: Turborepo + Bun workspaces (package manager: Bun)
- **Apps**:
  - `apps/web` — Next.js + TypeScript (strict), Tailwind CSS, TipTap editor, Yjs, `@hocuspocus/provider`, Better Auth React client
  - `apps/api` — Bun + Express + TypeScript; hosts Better Auth handler (`/api/auth/*`), notes & sharing REST, owns note metadata + collaborator records
  - `apps/socket` — Bun + Hocuspocus (Yjs WebSocket backend); `@hocuspocus/extension-redis` (cross-instance fanout) + `@hocuspocus/extension-database` (persistence); enforces auth/permissions on connect
- **Shared packages**:
  - `packages/db` — Drizzle ORM schema + client
  - `packages/auth` — Better Auth config + JWT/JWKS verify helpers
  - `packages/editor` — shared TipTap schema/extensions + doc→{title,preview,text} extraction
  - `packages/permissions` — effective-permission derivation (`none|view|edit`) + Redis cache helpers
  - `packages/typescript-config` — shared tsconfig bases
- **Database**: PostgreSQL with **Drizzle ORM** (NOT Prisma)
- **Realtime / CRDT**: Yjs (CRDT) over Hocuspocus WebSocket; awareness for cursors/presence
- **Pub/Sub & Cache**: Redis (Yjs fanout across socket instances, revoke broadcast, permissions cache)
- **Auth**: Better Auth — Google + GitHub OAuth, Drizzle adapter, JWT plugin (socket verifies handshake statelessly via JWKS)
- **Linting & Formatting**: Biome (replaces Prettier)
- **Testing**: Vitest (unit)
- **Local dev**: Docker Compose (Postgres + Redis) + `turbo dev`

### How to Split Large Changes

When a task requires extensive changes, break it into multiple PRs:

1. **By layer**: Separate database/schema changes, backend logic, and frontend UI into different PRs
2. **By feature component**: Split a feature into its constituent parts (e.g., API endpoint PR, then UI PR, then integration PR)
3. **By refactor vs feature**: Do preparatory refactoring in a separate PR before adding new functionality
4. **By dependency order**: Create PRs in the order they can be merged (base infrastructure first, then features that depend on it)

### Examples of Good PR Splits

**Instead of one large "Add booking notifications" PR:**
- PR 1: Add notification preferences schema and migration
- PR 2: Add notification service and API endpoints
- PR 3: Add notification UI components
- PR 4: Integrate notifications into booking flow

**Instead of one large "Refactor calendar sync" PR:**
- PR 1: Extract calendar sync logic into dedicated service
- PR 2: Add new calendar provider abstraction
- PR 3: Migrate existing providers to new abstraction
- PR 4: Add new calendar provider support

### Benefits of Smaller PRs

- Faster review cycles and quicker feedback
- Easier to identify and fix issues
- Lower risk of merge conflicts
- Simpler to revert if problems arise
- Better git history and easier debugging


## Spec-Driven Development (Opt-In)

For complex features, you can use spec-driven development when explicitly requested.

**To enable:** Tell the AI "use spec-driven development" or "follow the spec workflow"

See [SPEC-WORKFLOW.md](SPEC-WORKFLOW.md) for the full workflow documentation.

# Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.


## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---


