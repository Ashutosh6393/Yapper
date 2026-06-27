import { afterAll, beforeAll, expect, test } from "bun:test";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { db, note, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { buildServer } from "./index";

/**
 * End-to-end realtime coverage over a real WebSocket (goal states 1 & 5): a booted Hocuspocus
 * server (auth verifier stubbed — the JWT path is unit-tested separately), two `HocuspocusProvider`
 * clients on the same note. An edit on one client reaches the other, and the debounced store path
 * persists the doc and derives the title onto `note`. Single instance, no Redis (that's slice 05).
 */

const PORT = 7799;
const URL = `ws://127.0.0.1:${PORT}`;

let ownerId: string;
let noteId: string;
let server: ReturnType<typeof buildServer>;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: `rt-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
  const [created] = await db.insert(note).values({ ownerId }).returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;

  server = buildServer({
    port: PORT,
    verifyToken: async () => ({ userId: ownerId }),
    debounce: 100,
    maxDebounce: 300,
  });
  await server.listen();
}, 30_000);

afterAll(async () => {
  server?.destroy();
  // Pool drained globally — see test-setup.ts.
  await db.delete(user).where(eq(user.id, ownerId));
});

/** Resolve once the provider has completed its initial sync with the server. */
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

/** Poll an (optionally async) predicate until true or the timeout elapses. */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor: predicate never became true");
}

test("an edit on one client reaches a second client, and the server persists + derives the title", async () => {
  const clientA = await connect();

  // Edit on A: insert a paragraph the way TipTap would.
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText("Realtime hello")]);
  clientA.document.getXmlFragment("default").insert(0, [paragraph]);

  // A second client joining sees A's edit (synced through the single server instance).
  const clientB = await connect();
  await waitFor(() =>
    clientB.document.getXmlFragment("default").toString().includes("Realtime hello"),
  );
  expect(clientB.document.getXmlFragment("default").toString()).toContain("Realtime hello");

  // The debounced store path persisted the doc and derived the title onto the note row.
  await waitFor(async () => {
    const [row] = await db.select({ title: note.title }).from(note).where(eq(note.id, noteId));
    return row?.title === "Realtime hello";
  });
  const [row] = await db
    .select({ title: note.title, preview: note.preview })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.title).toBe("Realtime hello");

  clientA.destroy();
  clientB.destroy();
});
