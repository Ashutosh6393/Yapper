import { afterAll, beforeAll, expect, test } from "bun:test";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { db, note, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import { colorFromUserId } from "./identity";
import { buildServer } from "./index";

/**
 * Awareness / cursors coverage (goal states 1–3 & 5) over a real WebSocket. The server stamps a
 * server-authoritative identity from the verified JWT and pushes it to each client via a stateless
 * message; awareness states (carets/selections/presence) sync between two clients on one instance.
 * Cross-instance Redis fanout (goal state 4) is validated manually — see implementation.md.
 */

const PORT = 7798;
const URL = `ws://127.0.0.1:${PORT}`;
const REAL_NAME = "Ada Lovelace";

let ownerId: string;
let noteId: string;
let server: ReturnType<typeof buildServer>;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: REAL_NAME, email: `aw-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
  const [created] = await db.insert(note).values({ ownerId }).returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;

  server = buildServer({
    port: PORT,
    // The verifier is the only identity source — mirrors what the JWKS-verified JWT yields.
    verifyToken: async () => ({ userId: ownerId, name: REAL_NAME }),
  });
  await server.listen();
}, 30_000);

afterAll(async () => {
  server?.destroy();
  await db.delete(user).where(eq(user.id, ownerId));
});

function connect(): Promise<HocuspocusProvider> {
  return new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url: URL,
      name: noteId,
      token: "stub",
      onSynced: () => resolve(provider),
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor: predicate never became true");
}

test("the server pushes a server-authoritative identity derived from the verified JWT", async () => {
  let identity: unknown;
  const provider = new HocuspocusProvider({
    url: URL,
    name: noteId,
    token: "stub",
    onStateless: ({ payload }) => {
      identity = JSON.parse(payload);
    },
  });

  await waitFor(() => identity !== undefined);
  expect(identity).toEqual({
    type: "identity",
    user: { id: ownerId, name: REAL_NAME, color: colorFromUserId(ownerId) },
  });

  provider.destroy();
});

test("a client's awareness state (cursor/presence) reaches a second client", async () => {
  const clientA = await connect();
  const clientB = await connect();

  // A publishes its awareness `user` field (what CollaborationCaret broadcasts for carets/presence).
  clientA.setAwarenessField("user", { id: ownerId, name: REAL_NAME, color: "hsl(1, 70%, 45%)" });

  await waitFor(() => {
    for (const state of clientB.awareness?.getStates().values() ?? []) {
      if ((state.user as { name?: string } | undefined)?.name === REAL_NAME) return true;
    }
    return false;
  });

  clientA.destroy();
  clientB.destroy();
});
