# Make Private & Revoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner toggles note private → all collaborator WebSocket connections instantly disconnect with "note made private by owner"; token rotated; owner stays; re-share mints a fresh link; live role changes (view↔edit) force reconnect so permissions take effect without reload.

**Architecture:** The API publishes Redis events (`revoke:{noteId}`, `role-change:{noteId}`) after DB mutations; every socket instance subscribes to those channels via a dedicated IORedis subscriber and closes non-owner connections (or forces reconnect). The web client distinguishes "made private" kicks from transient disconnects via a stateless message sent before the WebSocket is closed.

**Tech Stack:** Bun, Express, Hocuspocus v2 (`@hocuspocus/server`), IORedis (ioredis v5), Drizzle ORM (PostgreSQL), Next.js (React), Vitest/Bun test.

## Global Constraints

- Never disconnect the owner connection — always check `isOwner` before closing.
- Make-private must be a single DB transaction (access=private, shareToken=NULL, all collaborators revoked, cache busted) before any Redis publish.
- Old share tokens must never reactivate — the share endpoint mints a new token when `shareToken` is NULL; never re-use the old one.
- Redis events must reach every socket instance — use IORedis `publish` so all instances that subscribed receive it.
- `biome check` and `bun run check-types` must pass after every commit.
- No `as any` casts.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/permissions/src/events.ts` | **Create** | Redis channel name helpers + `buildRedisPublisher()` |
| `packages/permissions/src/index.ts` | **Modify** | Export new events symbols |
| `apps/api/src/redis.ts` | **Create** | Singleton publisher instance wired for the api app |
| `apps/api/src/notes/router.ts` | **Modify** | Add `POST /:id/private`; add role-change publish to `POST /:id/share` |
| `apps/api/src/notes/private.test.ts` | **Create** | Integration tests for make-private endpoint |
| `apps/socket/src/auth.ts` | **Modify** | Add `loadNote` to `AuthorizeDeps`; add `isOwner` to `ConnectionContext` |
| `apps/socket/src/auth.test.ts` | **Modify** | Update `deps()` factory with `loadNote` stub |
| `apps/socket/src/revoke.ts` | **Create** | Redis subscriber + kick logic for revoke + role-change |
| `apps/socket/src/revoke.test.ts` | **Create** | Unit tests for revoke/kick with injected server stub |
| `apps/socket/src/index.ts` | **Modify** | Wire revoke subscriber; pass `loadNote` to `authorizeConnection` |
| `apps/web/lib/api.ts` | **Modify** | Add `makePrivate(id)` to `notesApi` |
| `apps/web/app/notes/[id]/Editor.tsx` | **Modify** | Handle `{ type:"kick", reason:"note_made_private" }` stateless message; add `made_private` ConnStatus |
| `apps/web/app/notes/[id]/ShareDialog.tsx` | **Modify** | Add "Make Private" button that calls `makePrivate` and lifts new access to parent |
| `apps/web/app/notes/[id]/page.tsx` | **Modify** | Accept access-change callback from ShareDialog to sync local `note.access` state |

---

## Task 1: Shared Redis events helpers in `@yapper/permissions`

**Files:**
- Create: `packages/permissions/src/events.ts`
- Modify: `packages/permissions/src/index.ts`

**Interfaces:**
- Produces:
  - `revokeChannel(noteId: string): string` — `"revoke:{noteId}"`
  - `roleChangeChannel(noteId: string): string` — `"role-change:{noteId}"`
  - `RedisPublisher` interface with `publish(channel: string, payload: string): Promise<void>` and `quit(): Promise<void>`
  - `buildRedisPublisher(): RedisPublisher | null` — returns null when `REDIS_URL` is unset

- [ ] **Step 1: Write the failing test (no-op, the helpers are pure/deterministic; skip to implementation)**

- [ ] **Step 2: Create `packages/permissions/src/events.ts`**

```typescript
import IORedis from "ioredis";

export function revokeChannel(noteId: string): string {
  return `revoke:${noteId}`;
}

export function roleChangeChannel(noteId: string): string {
  return `role-change:${noteId}`;
}

export interface RedisPublisher {
  publish(channel: string, payload: string): Promise<void>;
  quit(): Promise<void>;
}

/**
 * Build a raw IORedis publisher from `REDIS_URL`, or `null` when unset.
 * Used by `api` to broadcast revoke/role-change events to all socket instances.
 * A subscriber-mode connection cannot also publish, so this is a separate client.
 */
export function buildRedisPublisher(): RedisPublisher | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new IORedis(url);
  return {
    publish: async (channel, payload) => {
      await client.publish(channel, payload);
    },
    quit: async () => {
      await client.quit();
    },
  };
}
```

- [ ] **Step 3: Export from `packages/permissions/src/index.ts`**

Add to the existing exports:

```typescript
export {
  buildRedisPublisher,
  RedisPublisher,
  revokeChannel,
  roleChangeChannel,
} from "./events";
```

(Keep all existing exports intact; just append this block.)

- [ ] **Step 4: Run type-check**

```bash
cd packages/permissions && bun run check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/permissions/src/events.ts packages/permissions/src/index.ts
git commit -m "feat(permissions): add Redis event channel helpers + publisher"
```

---

## Task 2: `api` make-private endpoint + role-change publish

**Files:**
- Create: `apps/api/src/redis.ts`
- Modify: `apps/api/src/notes/router.ts`
- Create: `apps/api/src/notes/private.test.ts`

**Interfaces:**
- Consumes: `revokeChannel`, `roleChangeChannel`, `buildRedisPublisher` from `@yapper/permissions`
- Produces:
  - `POST /api/notes/:id/private` — owner only; 204 on success, 403/404 on error
  - `POST /api/notes/:id/share` — existing, now also publishes `role-change:{noteId}` after update

- [ ] **Step 1: Write the failing test in `apps/api/src/notes/private.test.ts`**

```typescript
import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../index";

const app = buildApp({ skipAuth: true });
let ownerId: string;
let collaboratorId: string;
let noteId: string;

function asUser(id: string) {
  return (req: supertest.Test) => req.set("x-test-user-id", id);
}

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: `priv-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [collab] = await db
    .insert(user)
    .values({ name: "Collab", email: `priv-collab-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !collab) throw new Error("user setup failed");
  ownerId = owner.id;
  collaboratorId = collab.id;
  const [created] = await db
    .insert(note)
    .values({ ownerId, access: "edit", shareToken: "old-token-abc" })
    .returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;
  await db.insert(noteCollaborator).values({ noteId, userId: collaboratorId, status: "active" });
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, collaboratorId));
});

test("POST /api/notes/:id/private makes the note private and revokes collaborators", async () => {
  const res = await asUser(ownerId)(supertest(app).post(`/api/notes/${noteId}/private`));
  expect(res.status).toBe(204);

  const [row] = await db
    .select({ access: note.access, shareToken: note.shareToken })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.access).toBe("private");
  expect(row?.shareToken).toBeNull();

  const [collab] = await db
    .select({ status: noteCollaborator.status })
    .from(noteCollaborator)
    .where(eq(noteCollaborator.noteId, noteId));
  expect(collab?.status).toBe("revoked");
});

test("POST /api/notes/:id/private returns 403 for non-owner", async () => {
  const res = await asUser(collaboratorId)(
    supertest(app).post(`/api/notes/${noteId}/private`),
  );
  expect(res.status).toBe(403);
});

test("POST /api/notes/:id/private returns 404 for unknown note", async () => {
  const res = await asUser(ownerId)(
    supertest(app).post(`/api/notes/00000000-0000-0000-0000-000000000000/private`),
  );
  expect(res.status).toBe(404);
});

test("old share token is dead after make-private", async () => {
  // Re-enable sharing with a known token first, so we have a real token to check
  await db
    .update(note)
    .set({ access: "view", shareToken: "check-dead-token" })
    .where(eq(note.id, noteId));

  await asUser(ownerId)(supertest(app).post(`/api/notes/${noteId}/private`));

  // The old token should not resolve any note now
  const [row] = await db
    .select({ id: note.id })
    .from(note)
    .where(eq(note.shareToken, "check-dead-token"));
  expect(row).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to see it fail**

```bash
cd apps/api && bun test src/notes/private.test.ts
```

Expected: FAIL — route `POST /api/notes/:id/private` does not exist yet.

- [ ] **Step 3: Create `apps/api/src/redis.ts`**

```typescript
import { buildRedisPublisher, type RedisPublisher } from "@yapper/permissions";

/**
 * Singleton Redis publisher for the api app. Null when REDIS_URL is unset (dev/test without Redis).
 * Used to notify socket instances of revoke and role-change events.
 */
export const redisPublisher: RedisPublisher | null = buildRedisPublisher();
```

- [ ] **Step 4: Add `POST /:id/private` to `apps/api/src/notes/router.ts`**

Add the following import at the top of the file (after existing imports):

```typescript
import { bustNotePermissions, roleChangeChannel, revokeChannel } from "@yapper/permissions";
import { redisPublisher } from "../redis";
```

Replace the existing `bustNotePermissions` import if it's already there — just add the new symbols.

Then add the new route after the existing `POST /:id/share` route (before `DELETE /:id`):

```typescript
  // POST /api/notes/:id/private — owner only. Atomically: set access=private, clear shareToken,
  // revoke all collaborators, bust perm cache, then publish revoke event to all socket instances.
  router.post(
    "/:id/private",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [row] = await db
        .select({ ownerId: note.ownerId })
        .from(note)
        .where(eq(note.id, id))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!ownsNote(row, userId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      await db.transaction(async (tx) => {
        await tx
          .update(note)
          .set({ access: "private", shareToken: null, updatedAt: new Date() })
          .where(eq(note.id, id));
        await tx
          .update(noteCollaborator)
          .set({ status: "revoked" })
          .where(eq(noteCollaborator.noteId, id));
      });
      await bustNotePermissions(permCache, id);
      await redisPublisher?.publish(revokeChannel(id), JSON.stringify({ reason: "made_private" }));
      res.status(204).end();
    }),
  );
```

- [ ] **Step 5: Also publish `role-change` in the existing `POST /:id/share` route**

In `apps/api/src/notes/router.ts`, find the end of the `POST /:id/share` handler (currently ends with `res.json({ token, url: ... })`). Add the publish call just before `res.json`:

```typescript
      await bustNotePermissions(permCache, id);
      await redisPublisher?.publish(
        roleChangeChannel(id),
        JSON.stringify({ newLevel: level }),
      );
      res.json({ token, url: `${webOrigin}/share/${token}`, access: level });
```

- [ ] **Step 6: Run the test to see it pass**

```bash
cd apps/api && bun test src/notes/private.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Run full API type-check and lint**

```bash
cd apps/api && bun run check-types
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/redis.ts apps/api/src/notes/router.ts apps/api/src/notes/private.test.ts
git commit -m "feat(api): POST /notes/:id/private — revoke + token rotation + Redis publish"
```

---

## Task 3: Socket auth — add `isOwner` to connection context

**Files:**
- Modify: `apps/socket/src/auth.ts`
- Modify: `apps/socket/src/auth.test.ts`

**Interfaces:**
- Produces:
  - `ConnectionContext` now includes `isOwner: boolean`
  - `AuthorizeDeps` now includes `loadNote: (noteId: string) => Promise<{ ownerId: string } | null>`

- [ ] **Step 1: Write the failing test in `apps/socket/src/auth.test.ts`**

Replace the `deps()` factory to include `loadNote`, and add a new test for `isOwner`:

```typescript
import { expect, test } from "bun:test";
import { type AuthorizeDeps, authorizeConnection } from "./auth";
import { colorFromUserId } from "./identity";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const NOTE = "22222222-2222-2222-2222-222222222222";

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    verifyToken: async () => ({ userId: USER, name: "User" }),
    resolvePermission: async () => "edit",
    loadNote: async () => ({ ownerId: USER }),
    ...over,
  };
}

test("an editor is accepted with a read/write (not read-only) connection", async () => {
  const result = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(result.context.userId).toBe(USER);
  expect(result.context.permission).toBe("edit");
  expect(result.readOnly).toBe(false);
});

test("a viewer is accepted but marked read-only", async () => {
  const result = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({ resolvePermission: async () => "view" }),
  );
  expect(result.context.permission).toBe("view");
  expect(result.readOnly).toBe(true);
});

test("stamps server-authoritative identity (name + deterministic color) onto the context", async () => {
  const { context } = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(context.name).toBe("User");
  expect(context.color).toBe(colorFromUserId(USER));
});

test("a user with no permission is rejected", async () => {
  await expect(
    authorizeConnection(
      { token: "t", documentName: NOTE },
      deps({ resolvePermission: async () => "none" }),
    ),
  ).rejects.toThrow();
});

test("rejects when the token fails verification", async () => {
  await expect(
    authorizeConnection(
      { token: "bad", documentName: NOTE },
      deps({
        verifyToken: async () => {
          throw new Error("invalid token");
        },
      }),
    ),
  ).rejects.toThrow();
});

test("sets isOwner=true when the verified userId matches the note ownerId", async () => {
  const { context } = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(context.isOwner).toBe(true);
});

test("sets isOwner=false for a non-owner collaborator", async () => {
  const { context } = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({
      verifyToken: async () => ({ userId: OTHER, name: "Other" }),
      resolvePermission: async () => "view",
      loadNote: async () => ({ ownerId: USER }),
    }),
  );
  expect(context.isOwner).toBe(false);
});

test("sets isOwner=false when the note cannot be loaded", async () => {
  const { context } = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({ loadNote: async () => null }),
  );
  expect(context.isOwner).toBe(false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
cd apps/socket && bun test src/auth.test.ts
```

Expected: FAIL — `AuthorizeDeps` does not have `loadNote`, `ConnectionContext` does not have `isOwner`.

- [ ] **Step 3: Update `apps/socket/src/auth.ts`**

Replace the full file:

```typescript
import type { Permission } from "@yapper/permissions";
import { colorFromUserId } from "./identity";

/**
 * Per-connection identity stored on the Hocuspocus `context` once the handshake is authorized.
 * `name`/`color` are server-authoritative (sourced from the verified JWT, not the client) and are
 * pushed to the client to render its awareness label — ADR-002/003. `permission` lets the client
 * decide editability (`edit` → editable); the server still enforces read-only regardless.
 * `isOwner` gates slice-07 revoke logic: owner connections are never kicked.
 */
export interface ConnectionContext {
  userId: string;
  name: string;
  color: string;
  permission: Permission;
  isOwner: boolean;
}

/** Outcome of authorizing a handshake: the connection context + whether it must be read-only. */
export interface AuthorizeResult {
  context: ConnectionContext;
  /** `true` for viewers — the server drops their inbound doc updates (ADR-003). */
  readOnly: boolean;
}

export interface AuthorizeDeps {
  /** Verify the handshake JWT statelessly (JWKS) → the authenticated `userId` + display `name`. Throws if invalid. */
  verifyToken: (token: string) => Promise<{ userId: string; name: string }>;
  /** Effective permission for this user on this note (cache-first, via `@yapper/permissions`). */
  resolvePermission: (noteId: string, userId: string) => Promise<Permission>;
  /** Load the note's ownerId to determine if this user is the owner. Returns null if note not found. */
  loadNote: (noteId: string) => Promise<{ ownerId: string } | null>;
}

/**
 * Authorize a Hocuspocus WebSocket handshake. Verifies the JWT first (never trusts client-supplied
 * identity), then derives the user's effective permission via the shared `@yapper/permissions` rule
 * (ADR-001) — identical to the `api` REST guards. `none` rejects the connection; `view` returns a
 * read-only connection (server drops inbound updates — ADR-003); `edit`/owner is read/write.
 */
export async function authorizeConnection(
  params: { token: string; documentName: string },
  deps: AuthorizeDeps,
): Promise<AuthorizeResult> {
  const { userId, name } = await deps.verifyToken(params.token);
  const [permission, noteData] = await Promise.all([
    deps.resolvePermission(params.documentName, userId),
    deps.loadNote(params.documentName),
  ]);
  if (permission === "none") throw new Error("Forbidden: no access to this note");
  return {
    context: {
      userId,
      name,
      color: colorFromUserId(userId),
      permission,
      isOwner: noteData?.ownerId === userId,
    },
    readOnly: permission === "view",
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd apps/socket && bun test src/auth.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Run type-check**

```bash
cd apps/socket && bun run check-types
```

Expected: no errors. (The `index.ts` `onAuthenticate` handler will need updating in Task 4; TypeScript may flag missing `loadNote` — fix there.)

- [ ] **Step 6: Commit**

```bash
git add apps/socket/src/auth.ts apps/socket/src/auth.test.ts
git commit -m "feat(socket/auth): add isOwner to ConnectionContext, loadNote to AuthorizeDeps"
```

---

## Task 4: Socket revoke subscriber + connection-kick logic

**Files:**
- Create: `apps/socket/src/revoke.ts`
- Create: `apps/socket/src/revoke.test.ts`
- Modify: `apps/socket/src/index.ts`

**Interfaces:**
- Consumes:
  - `Hocuspocus` from `@hocuspocus/server` (the server reference for `server.documents`)
  - `ConnectionContext` from `./auth`
  - `revokeChannel`, `roleChangeChannel` from `@yapper/permissions`
- Produces:
  - `setupRevokeSubscriber(server: Hocuspocus, redisUrl: string): IORedis` — subscribes and returns the subscriber client for cleanup
  - `kickNonOwners(server: Hocuspocus, noteId: string, reason: "note_made_private" | "role_change"): void` — exported for testing

- [ ] **Step 1: Write the failing tests in `apps/socket/src/revoke.test.ts`**

```typescript
import { expect, test } from "bun:test";
import type { Hocuspocus } from "@hocuspocus/server";
import type { ConnectionContext } from "./auth";
import { kickNonOwners } from "./revoke";

const OWNER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COLLAB_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOTE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeContext(userId: string, isOwner: boolean): ConnectionContext {
  return { userId, name: "User", color: "#000", permission: "edit", isOwner };
}

type FakeConn = {
  context: ConnectionContext;
  statelessSent: string[];
  closed: boolean;
  sendStateless(payload: string): void;
  webSocket: { close(): void };
};

function makeConn(ctx: ConnectionContext): FakeConn {
  const conn: FakeConn = {
    context: ctx,
    statelessSent: [],
    closed: false,
    sendStateless(payload) {
      this.statelessSent.push(payload);
    },
    webSocket: {
      close() {
        conn.closed = true;
      },
    },
  };
  return conn;
}

function makeServer(conns: FakeConn[]): Hocuspocus {
  const connMap = new Map(conns.map((c) => [c, {}]));
  const doc = { connections: connMap };
  const documents = new Map([[NOTE_ID, doc]]);
  return { documents } as unknown as Hocuspocus;
}

test("kickNonOwners closes collaborator connections with note_made_private stateless message", () => {
  const owner = makeConn(makeContext(OWNER_ID, true));
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([owner, collab]);

  kickNonOwners(server, NOTE_ID, "note_made_private");

  expect(owner.closed).toBe(false);
  expect(owner.statelessSent).toHaveLength(0);
  expect(collab.closed).toBe(true);
  expect(collab.statelessSent).toHaveLength(1);
  expect(JSON.parse(collab.statelessSent[0]!)).toEqual({
    type: "kick",
    reason: "note_made_private",
  });
});

test("kickNonOwners for role_change closes non-owner connections (no stateless message — auto-reconnect)", () => {
  const owner = makeConn(makeContext(OWNER_ID, true));
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([owner, collab]);

  kickNonOwners(server, NOTE_ID, "role_change");

  expect(owner.closed).toBe(false);
  expect(collab.closed).toBe(true);
  expect(collab.statelessSent).toHaveLength(0);
});

test("kickNonOwners is a no-op when the document has no connections on this instance", () => {
  const server = makeServer([]);
  expect(() => kickNonOwners(server, NOTE_ID, "note_made_private")).not.toThrow();
});

test("kickNonOwners is a no-op for an unknown noteId", () => {
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([collab]);
  expect(() => kickNonOwners(server, "unknown-note", "note_made_private")).not.toThrow();
  expect(collab.closed).toBe(false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

```bash
cd apps/socket && bun test src/revoke.test.ts
```

Expected: FAIL — `kickNonOwners` does not exist yet.

- [ ] **Step 3: Create `apps/socket/src/revoke.ts`**

```typescript
import type { Hocuspocus } from "@hocuspocus/server";
import IORedis from "ioredis";
import { revokeChannel, roleChangeChannel } from "@yapper/permissions";
import type { ConnectionContext } from "./auth";

type KickReason = "note_made_private" | "role_change";

/**
 * Close all non-owner connections on a document. For `note_made_private`, sends a stateless kick
 * message first so the client can distinguish a permanent removal from a transient disconnect and
 * avoid reconnecting. For `role_change`, closes without a message — the client auto-reconnects and
 * `onAuthenticate` re-evaluates the new permission level.
 */
export function kickNonOwners(server: Hocuspocus, noteId: string, reason: KickReason): void {
  const doc = server.documents.get(noteId);
  if (!doc) return;
  for (const [connection] of doc.connections) {
    const ctx = connection.context as ConnectionContext;
    if (ctx.isOwner) continue;
    if (reason === "note_made_private") {
      connection.sendStateless(JSON.stringify({ type: "kick", reason: "note_made_private" }));
    }
    connection.webSocket.close();
  }
}

/**
 * Subscribe to `revoke:{noteId}` and `role-change:{noteId}` channels on Redis.
 * On each event, calls `kickNonOwners` so every socket instance disconnects the affected clients.
 * Returns the IORedis subscriber so the caller can quit it on shutdown.
 */
export function setupRevokeSubscriber(server: Hocuspocus, redisUrl: string): IORedis {
  const sub = new IORedis(redisUrl);

  sub.psubscribe(`${revokeChannel("*")}`, `${roleChangeChannel("*")}`, (err) => {
    if (err) console.error("[socket] revoke subscriber psubscribe error:", err);
  });

  sub.on("pmessage", (_pattern: string, channel: string, _message: string) => {
    const revokePrefix = "revoke:";
    const rolePrefix = "role-change:";
    if (channel.startsWith(revokePrefix)) {
      const noteId = channel.slice(revokePrefix.length);
      kickNonOwners(server, noteId, "note_made_private");
    } else if (channel.startsWith(rolePrefix)) {
      const noteId = channel.slice(rolePrefix.length);
      kickNonOwners(server, noteId, "role_change");
    }
  });

  return sub;
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
cd apps/socket && bun test src/revoke.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Wire the subscriber into `apps/socket/src/index.ts`**

Add imports at the top:

```typescript
import IORedis from "ioredis";
import { loadNote } from "@yapper/permissions";
import { setupRevokeSubscriber } from "./revoke";
```

Extend `BuildServerOptions` to add injectable `loadNote` (for tests):

```typescript
export interface BuildServerOptions {
  port?: number;
  verifyToken?: AuthorizeDeps["verifyToken"];
  resolvePermission?: AuthorizeDeps["resolvePermission"];
  /** Note loader; defaults to the db-backed `loadNote` from `@yapper/permissions`. Injectable for tests. */
  loadNote?: AuthorizeDeps["loadNote"];
  debounce?: number;
  maxDebounce?: number;
}
```

Update `buildServer()` to wire `loadNote` into `authorizeConnection` and set up the revoke subscriber:

```typescript
export function buildServer(options: BuildServerOptions = {}): Hocuspocus {
  const verifyToken = options.verifyToken ?? verifyJwt;
  const resolveDeps = buildResolveDeps();
  const resolvePerm =
    options.resolvePermission ??
    ((noteId: string, userId: string) => resolvePermission(noteId, userId, resolveDeps));
  const loadNoteFn = options.loadNote ?? loadNote;
  const redis = buildRedisExtension();

  const server = Server.configure({
    port: options.port ?? defaultPort,
    ...(options.debounce !== undefined ? { debounce: options.debounce } : {}),
    ...(options.maxDebounce !== undefined ? { maxDebounce: options.maxDebounce } : {}),
    extensions: [
      ...(redis ? [redis] : []),
      new Database({
        fetch: async ({ documentName }) => {
          const state = await loadDocState(documentName);
          return state ?? null;
        },
        store: async ({ documentName, state }) => {
          await saveDocState(documentName, Buffer.from(state));
        },
      }),
    ],
    async onAuthenticate({ token, documentName, connection }) {
      const { context, readOnly } = await authorizeConnection(
        { token, documentName },
        { verifyToken, resolvePermission: resolvePerm, loadNote: loadNoteFn },
      );
      connection.readOnly = readOnly;
      return context;
    },
    async connected({ context, connectionInstance }) {
      const { userId, name, permission } = context as ConnectionContext;
      const payload = JSON.stringify({
        type: "identity",
        user: awarenessUserFor({ userId, name }),
        permission,
      });
      connectionInstance.sendStateless(payload);
    },
    async onStoreDocument({ documentName, document }) {
      await saveDerivedMetadata(documentName, document);
    },
    async onListen() {
      console.log(`[socket] hocuspocus listening on ws://localhost:${options.port ?? defaultPort}`);
    },
  });

  // Wire up the Redis revoke subscriber (no-op when REDIS_URL is unset).
  const redisUrl = process.env.REDIS_URL;
  let revokeSubscriber: IORedis | null = null;
  if (redisUrl) {
    revokeSubscriber = setupRevokeSubscriber(server, redisUrl);
  }

  // Patch destroy to also clean up the revoke subscriber.
  const originalDestroy = server.destroy.bind(server);
  server.destroy = async () => {
    await revokeSubscriber?.quit();
    return originalDestroy();
  };

  return server;
}
```

- [ ] **Step 6: Run type-check**

```bash
cd apps/socket && bun run check-types
```

Expected: no errors.

- [ ] **Step 7: Run all socket tests**

```bash
cd apps/socket && bun test
```

Expected: all tests PASS (existing tests pass because `loadNote` has a default).

- [ ] **Step 8: Commit**

```bash
git add apps/socket/src/revoke.ts apps/socket/src/revoke.test.ts apps/socket/src/index.ts
git commit -m "feat(socket): revoke subscriber — kick non-owner connections on Redis revoke/role-change"
```

---

## Task 5: Web — make-private API + Editor disconnect handling + Share UI

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/app/notes/[id]/Editor.tsx`
- Modify: `apps/web/app/notes/[id]/ShareDialog.tsx`
- Modify: `apps/web/app/notes/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - `notesApi.makePrivate(id)` from `apps/web/lib/api.ts`
  - Stateless message `{ type: "kick", reason: "note_made_private" }` from socket
- Produces:
  - `Editor` now accepts an optional `onMadePrivate` callback
  - `ShareDialog` accepts an `onAccessChange(newAccess: NoteAccess)` callback and calls `makePrivate` for the private toggle
  - `page.tsx` syncs local `note.access` on share changes and navigates on made-private

- [ ] **Step 1: Add `makePrivate` to `apps/web/lib/api.ts`**

In `apps/web/lib/api.ts`, extend the `notesApi` object — add `makePrivate` after `share`:

```typescript
export const notesApi = {
  list: () => api<NoteSummary[]>("/api/notes"),
  listShared: () => api<SharedNoteSummary[]>("/api/notes/shared"),
  create: () => api<NoteMetadata>("/api/notes", { method: "POST" }),
  get: (id: string) => api<NoteMetadata>(`/api/notes/${id}`),
  remove: (id: string) => api<void>(`/api/notes/${id}`, { method: "DELETE" }),
  share: (id: string, level: Exclude<NoteAccess, "private">) =>
    api<ShareInfo>(`/api/notes/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ level }),
    }),
  makePrivate: (id: string) => api<void>(`/api/notes/${id}/private`, { method: "POST" }),
};
```

- [ ] **Step 2: Update `apps/web/app/notes/[id]/Editor.tsx` — handle kick and made-private state**

Replace the entire file content:

```typescript
"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "@yapper/editor";
import { useEffect, useState } from "react";
import { getAuthToken } from "../../../lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "ws://localhost:1234";

type ConnStatus = "connecting" | "connected" | "disconnected" | "denied" | "made_private";
type Permission = "none" | "view" | "edit";

interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

export function Editor({
  noteId,
  onMadePrivate,
}: {
  noteId: string;
  onMadePrivate?: () => void;
}) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [identity, setIdentity] = useState<AwarenessUser | null>(null);
  const [permission, setPermission] = useState<Permission>("view");

  useEffect(() => {
    // Track whether we intentionally disconnected due to a server kick, so `onDisconnect`
    // does not override the `made_private` status with "disconnected".
    let madePrivate = false;

    const p = new HocuspocusProvider({
      url: SOCKET_URL,
      name: noteId,
      token: () => getAuthToken(),
      onStatus: ({ status }) => setStatus(status === "connected" ? "connected" : "connecting"),
      onDisconnect: () => {
        if (!madePrivate) setStatus("disconnected");
      },
      onAuthenticationFailed: () => setStatus("denied"),
      onStateless: ({ payload }) => {
        const msg = JSON.parse(payload) as {
          type?: string;
          user?: AwarenessUser;
          permission?: Permission;
          reason?: string;
        };
        if (msg.type === "identity" && msg.user) setIdentity(msg.user);
        if (msg.permission) setPermission(msg.permission);
        if (msg.type === "kick" && msg.reason === "note_made_private") {
          madePrivate = true;
          setStatus("made_private");
          p.disconnect();
          onMadePrivate?.();
        }
      },
    });
    setProvider(p);
    return () => p.destroy();
  }, [noteId, onMadePrivate]);

  if (!provider) return null;
  return (
    <BoundEditor
      key={noteId}
      provider={provider}
      status={status}
      identity={identity}
      permission={permission}
    />
  );
}

function BoundEditor({
  provider,
  status,
  identity,
  permission,
}: {
  provider: HocuspocusProvider;
  status: ConnStatus;
  identity: AwarenessUser | null;
  permission: Permission;
}) {
  const editor = useEditor({
    extensions: [...buildExtensions(provider.document), CollaborationCaret.configure({ provider })],
    immediatelyRender: false,
    editable: false,
    editorProps: { attributes: { style: editorAttrStyle } },
  });

  useEffect(() => {
    if (editor && identity) editor.commands.updateUser(identity);
  }, [editor, identity]);

  useEffect(() => {
    editor?.setEditable(permission === "edit");
  }, [editor, permission]);

  if (status === "made_private") {
    return (
      <div style={madePrivateBanner}>
        <p style={{ margin: 0, fontWeight: 600 }}>Note made private by owner</p>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#555" }}>
          The owner has stopped sharing this note.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={topRow}>
        <ConnectionBadge status={status} />
        {permission === "view" && <span style={viewOnlyTag}>View only</span>}
        {editor && <Presence provider={provider} />}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Presence({ provider }: { provider: HocuspocusProvider }) {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      const byId = new Map<string, AwarenessUser>();
      for (const state of awareness.getStates().values()) {
        const user = (state as { user?: AwarenessUser }).user;
        if (user?.id) byId.set(user.id, user);
      }
      setUsers([...byId.values()]);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);

  if (users.length === 0) return null;
  return (
    <div style={presence}>
      {users.map((u) => (
        <span key={u.id} style={chip} title={u.name}>
          <span style={{ ...dot, background: u.color }} />
          {u.name}
        </span>
      ))}
    </div>
  );
}

function ConnectionBadge({ status }: { status: ConnStatus }) {
  const label: Record<ConnStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected — reconnecting…",
    denied: "Access denied",
    made_private: "Note made private",
  };
  const color: Record<ConnStatus, string> = {
    connecting: "#b58900",
    connected: "#2aa198",
    disconnected: "#b58900",
    denied: "#d33",
    made_private: "#d33",
  };
  return (
    <div style={{ ...badge, color: color[status] }}>
      <span style={{ ...dot, background: color[status] }} />
      {label[status]}
    </div>
  );
}

const topRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
};
const presence = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
};
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f3f3f3",
} as const;
const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  marginBottom: 12,
} as const;
const dot = { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } as const;
const viewOnlyTag = {
  fontSize: 12,
  color: "#b58900",
  border: "1px solid #e6d8a8",
  borderRadius: 999,
  padding: "1px 8px",
} as const;
const madePrivateBanner = {
  padding: "24px 16px",
  background: "#fff5f5",
  border: "1px solid #ffc5c5",
  borderRadius: 8,
  textAlign: "center" as const,
} as const;
const editorAttrStyle =
  "min-height: 320px; outline: none; border: 1px solid #e2e2e2; border-radius: 8px; padding: 16px;";
```

- [ ] **Step 3: Update `apps/web/app/notes/[id]/ShareDialog.tsx` — add Make Private button**

Replace the full file:

```typescript
"use client";

import { useState } from "react";
import { type NoteAccess, notesApi, type ShareInfo } from "../../../lib/api";

type ShareLevel = Exclude<NoteAccess, "private">;

/**
 * Owner-only sharing control. Pick view/edit to enable sharing, copy the link, or make the note
 * private again (rotates the token and instantly disconnects all collaborators — slice 07).
 */
export function ShareDialog({
  noteId,
  initialAccess,
  onAccessChange,
}: {
  noteId: string;
  initialAccess: NoteAccess;
  onAccessChange?: (newAccess: NoteAccess) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<ShareLevel>(initialAccess === "edit" ? "edit" : "view");
  const [share, setShare] = useState<ShareInfo | null>(
    // If already shared, surface the current access so the panel shows the link state.
    initialAccess !== "private" ? ({ access: initialAccess } as ShareInfo) : null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function enableSharing() {
    setBusy(true);
    try {
      const info = await notesApi.share(noteId, level);
      setShare(info);
      onAccessChange?.(info.access);
    } finally {
      setBusy(false);
    }
  }

  async function makePrivate() {
    setBusy(true);
    try {
      await notesApi.makePrivate(noteId);
      setShare(null);
      setOpen(false);
      onAccessChange?.("private");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!share?.url) return;
    await navigator.clipboard.writeText(share.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={primaryBtn}>
        Share
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <strong>Share this note</strong>
        <button type="button" onClick={() => setOpen(false)} style={ghostBtn}>
          ✕
        </button>
      </div>

      <label style={{ display: "block", fontSize: 14 }}>
        Anyone with the link can:
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as ShareLevel)}
          style={{ marginLeft: 8 }}
        >
          <option value="view">View</option>
          <option value="edit">Edit</option>
        </select>
      </label>

      <button type="button" onClick={enableSharing} disabled={busy} style={primaryBtn}>
        {busy ? "Saving…" : share ? "Update access" : "Enable sharing"}
      </button>

      {share?.url ? (
        <div style={linkRow}>
          <input readOnly value={share.url} style={linkInput} />
          <button type="button" onClick={copyLink} style={ghostBtn}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : null}

      {share ? (
        <button type="button" onClick={makePrivate} disabled={busy} style={dangerBtn}>
          {busy ? "Saving…" : "Make private"}
        </button>
      ) : null}
    </div>
  );
}

const primaryBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
} as const;
const ghostBtn = { padding: "6px 10px", borderRadius: 6, cursor: "pointer" } as const;
const dangerBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d33",
  color: "#d33",
  background: "transparent",
  cursor: "pointer",
} as const;
const panel = {
  position: "absolute" as const,
  right: 0,
  marginTop: 8,
  width: 320,
  background: "#fff",
  border: "1px solid #e2e2e2",
  borderRadius: 8,
  padding: 16,
  display: "grid",
  gap: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  zIndex: 10,
};
const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;
const linkRow = { display: "flex", gap: 8 } as const;
const linkInput = {
  flex: 1,
  fontSize: 12,
  padding: "6px 8px",
  border: "1px solid #e2e2e2",
  borderRadius: 6,
} as const;
```

- [ ] **Step 4: Update `apps/web/app/notes/[id]/page.tsx` — wire `onAccessChange` and `onMadePrivate`**

Replace the full file:

```typescript
"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type NoteAccess, type NoteMetadata, notesApi } from "../../../lib/api";
import { useSession } from "../../../lib/auth-client";
import { Editor } from "./Editor";
import { ShareDialog } from "./ShareDialog";

export default function NotePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [note, setNote] = useState<NoteMetadata | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const loadNote = useCallback(() => {
    notesApi
      .get(id)
      .then((data) => {
        setNote(data);
        setStatus("ready");
      })
      .catch(() => setStatus("notfound"));
  }, [id]);

  useEffect(() => {
    if (session) loadNote();
  }, [session, loadNote]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null;

  async function deleteNote() {
    setDeleting(true);
    try {
      await notesApi.remove(id);
      router.push("/dashboard");
    } catch {
      setDeleting(false);
    }
  }

  function handleAccessChange(newAccess: NoteAccess) {
    setNote((prev) => (prev ? { ...prev, access: newAccess } : prev));
  }

  function handleMadePrivate() {
    router.push("/dashboard");
  }

  if (status === "loading") return <main style={main}>Loading note…</main>;
  if (status === "notfound" || !note) {
    return (
      <main style={main}>
        <p>Note not found.</p>
        <button type="button" onClick={() => router.push("/dashboard")} style={ghostBtn}>
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main style={main}>
      <header style={header}>
        <button type="button" onClick={() => router.push("/dashboard")} style={ghostBtn}>
          ← My Notes
        </button>
        {note.isOwner ? (
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <ShareDialog
              noteId={id}
              initialAccess={note.access}
              onAccessChange={handleAccessChange}
            />
            <button type="button" onClick={deleteNote} disabled={deleting} style={dangerBtn}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : null}
      </header>

      <h1>{note.title}</h1>
      <Editor noteId={id} onMadePrivate={note.isOwner ? undefined : handleMadePrivate} />
    </main>
  );
}

const main = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 720 } as const;
const header = { display: "flex", justifyContent: "space-between", marginBottom: 24 } as const;
const ghostBtn = { padding: "6px 12px", borderRadius: 6, cursor: "pointer" } as const;
const dangerBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d33",
  color: "#d33",
  background: "transparent",
  cursor: "pointer",
} as const;
```

- [ ] **Step 5: Run type-check for web**

```bash
cd apps/web && bun run check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/app/notes/[id]/Editor.tsx apps/web/app/notes/[id]/ShareDialog.tsx apps/web/app/notes/[id]/page.tsx
git commit -m "feat(web): make-private toggle + made-private disconnect handling"
```

---

## Task 6: Update spec status + final verification

**Files:**
- Modify: `specs/07-make-private-revoke/implementation.md`
- Modify: `specs/ROADMAP.md`

- [ ] **Step 1: Run all tests across the monorepo**

```bash
cd J:/Projects/Yapper && bun run --filter '*' test
```

Or run per package:

```bash
cd packages/permissions && bun test
cd apps/api && bun test
cd apps/socket && bun test
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint + type-check**

```bash
cd J:/Projects/Yapper && bun run --filter '*' check-types
```

Expected: no type errors across all packages.

- [ ] **Step 3: Update `specs/07-make-private-revoke/implementation.md`**

Replace the Status line and fill in the Completed section:

```markdown
## Status: done

## Completed
1. `packages/permissions/src/events.ts` — Redis channel helpers + `buildRedisPublisher()`.
2. `api` `POST /api/notes/:id/private` — transaction (access, token null, revoke collaborators, bust cache) + `PUBLISH revoke:{noteId}`.
3. `api` `POST /api/notes/:id/share` — now also publishes `role-change:{noteId}` on level change.
4. `socket` `auth.ts` — `isOwner` in `ConnectionContext`, `loadNote` in `AuthorizeDeps`.
5. `socket` `revoke.ts` — Redis subscriber; `kickNonOwners` closes non-owner connections; stateless kick for `note_made_private`.
6. `socket` `index.ts` — revoke subscriber wired; `loadNote` passed to `authorizeConnection`.
7. `web` — `makePrivate` API method; Editor handles `note_made_private` kick; ShareDialog "Make Private" button; page routes collaborator out on kick.
```

- [ ] **Step 4: Update `specs/ROADMAP.md`**

Change the slice 07 row status from `not-started` to `done`:

```
| 07 | [make-private-revoke](./07-make-private-revoke/design.md) | 06 | **done** | Owner toggles private → collaborators instantly disconnected with "note made private by owner"; token rotated; owner stays connected |
```

- [ ] **Step 5: Commit**

```bash
git add specs/07-make-private-revoke/implementation.md specs/ROADMAP.md
git commit -m "docs(spec): mark slice 07 make-private-revoke as done"
```

---

## Self-Review Against Spec

| Goal state requirement | Covered by |
|------------------------|------------|
| 1. Owner has private toggle | Task 5 — ShareDialog "Make Private" button |
| 2. Toggle: access=private, token rotated, collaborators revoked, cache busted | Task 2 — `POST /:id/private` transaction |
| 3. Every collaborator instantly disconnected on all instances | Tasks 4 + 2 — Redis PUBLISH → subscriber closes connections |
| 4. Owner stays connected | Task 4 — `kickNonOwners` checks `ctx.isOwner` |
| 5. Dead link → access-denied; note off "Shared with me" | Task 2 — `shareToken=NULL` means no row matches old token; `status='revoked'` means off shared list |
| 6. Re-share mints new token; old never reactivates | No code change needed — existing `POST /:id/share` mints new token when `shareToken` is NULL (set by Task 2) |
| 7. Live role change (view↔edit) forces reconnect, no manual refresh | Tasks 2 + 4 — `POST /:id/share` publishes `role-change`; subscriber kicks non-owners to reconnect |

**Placeholder scan:** No TBD/TODO/placeholder left. All code blocks are complete.

**Type consistency:**
- `ConnectionContext.isOwner: boolean` — defined in Task 3, read in Task 4 (`kickNonOwners`).
- `revokeChannel(noteId)` / `roleChangeChannel(noteId)` — defined in Task 1, used in Tasks 2 and 4.
- `RedisPublisher.publish(channel, payload)` — defined in Task 1, used in Task 2.
- `kickNonOwners(server, noteId, reason)` — defined in Task 4, tested with fake server in revoke.test.ts.
- `AuthorizeDeps.loadNote` — defined in Task 3, wired in Task 4 (`index.ts`), defaulted to db-backed `loadNote` from `@yapper/permissions`.
