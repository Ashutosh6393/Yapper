import { afterAll, beforeAll, expect, test } from "bun:test";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { db, note, noteDoc, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { buildServer } from "./index";

/**
 * Goal state 4: view-only is enforced **server-side**. A viewer connection is marked read-only in
 * `onAuthenticate`, so Hocuspocus drops its inbound doc updates while still streaming server→client.
 * Permission is injected (owner→edit, viewer→view) so this isolates the read-only wiring; the
 * derivation itself is unit-tested in `@yapper/permissions`.
 */

const PORT = 7801;
const URL = `ws://127.0.0.1:${PORT}`;

let ownerId: string;
let viewerId: string;
let noteId: string;
let server: ReturnType<typeof buildServer>;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: `ro-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [viewer] = await db
    .insert(user)
    .values({ name: "Viewer", email: `ro-viewer-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !viewer) throw new Error("user setup failed");
  ownerId = owner.id;
  viewerId = viewer.id;
  const [created] = await db.insert(note).values({ ownerId, access: "view" }).returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;

  server = buildServer({
    port: PORT,
    verifyToken: async (token) =>
      token === "viewer"
        ? { userId: viewerId, name: "Viewer" }
        : { userId: ownerId, name: "Owner" },
    resolvePermission: async (_noteId, userId) => (userId === ownerId ? "edit" : "view"),
    debounce: 100,
    maxDebounce: 300,
  });
  await server.listen();
}, 30_000);

afterAll(async () => {
  server?.destroy();
  // Pool drained globally — see test-setup.ts.
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, viewerId));
});

function connect(token: string): Promise<HocuspocusProvider> {
  return new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url: URL,
      name: noteId,
      token,
      onSynced: () => resolve(provider),
    });
  });
}

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

function insertParagraph(provider: HocuspocusProvider, text: string): void {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  provider.document.getXmlFragment("default").insert(0, [paragraph]);
}

test("a viewer's inbound edits are dropped server-side; an editor's are applied", async () => {
  const editor = await connect("owner");
  const viewer = await connect("viewer");

  // Editor's edit reaches the viewer (outbound streaming is unaffected by read-only).
  insertParagraph(editor, "EDIT-OK");
  await waitFor(() => viewer.document.getXmlFragment("default").toString().includes("EDIT-OK"));

  // Viewer attempts an edit; the server must NOT broadcast or persist it.
  insertParagraph(viewer, "VIEW-BLOCKED");
  // Give the (rejected) update ample time to NOT propagate, and the editor's edit time to persist.
  await waitFor(async () => {
    const [row] = await db
      .select({ state: noteDoc.state })
      .from(noteDoc)
      .where(eq(noteDoc.noteId, noteId));
    if (!row) return false;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(row.state));
    return doc.getXmlFragment("default").toString().includes("EDIT-OK");
  });

  // The editor never received the viewer's blocked edit.
  expect(editor.document.getXmlFragment("default").toString()).not.toContain("VIEW-BLOCKED");

  // The persisted doc has the editor's content but not the viewer's rejected edit.
  const [persisted] = await db
    .select({ state: noteDoc.state })
    .from(noteDoc)
    .where(eq(noteDoc.noteId, noteId));
  const restored = new Y.Doc();
  Y.applyUpdate(restored, new Uint8Array(persisted?.state as Buffer));
  const content = restored.getXmlFragment("default").toString();
  expect(content).toContain("EDIT-OK");
  expect(content).not.toContain("VIEW-BLOCKED");

  editor.destroy();
  viewer.destroy();
});
