import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { saveDerivedMetadata } from "./metadata";
import { loadDocState, loadNoteOwner, saveDocState } from "./persistence";

/**
 * Integration coverage for the socket's DB-facing path (goal states 2–4): owner lookup for the
 * handshake, full-state persistence + reload, and server-side title/preview derivation — all
 * against the real database, exactly what the connect/store path invokes.
 */

let ownerId: string;
let noteId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: `socket-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
  const [created] = await db.insert(note).values({ ownerId }).returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;
}, 30_000);

afterAll(async () => {
  // Cascades the note + note_doc owned by this user. (Pool drained globally — see test-setup.ts.)
  await db.delete(user).where(eq(user.id, ownerId));
});

/** Build a Yjs doc whose `default` fragment mirrors TipTap output: one paragraph per line. */
function buildDoc(...lines: string[]): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const blocks = lines.map((line) => {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(line)]);
    return paragraph;
  });
  fragment.insert(0, blocks);
  return ydoc;
}

test("loadNoteOwner returns the owner for a real note and null for a missing one", async () => {
  expect(await loadNoteOwner(noteId)).toBe(ownerId);
  expect(await loadNoteOwner(crypto.randomUUID())).toBeNull();
});

test("doc state round-trips: save then load restores the same Yjs content", async () => {
  const ydoc = buildDoc("Persisted line");
  await saveDocState(noteId, Buffer.from(Y.encodeStateAsUpdate(ydoc)));

  const loaded = await loadDocState(noteId);
  expect(loaded).not.toBeNull();

  const restored = new Y.Doc();
  Y.applyUpdate(restored, new Uint8Array(loaded as Buffer));
  expect(restored.getXmlFragment("default").toString()).toContain("Persisted line");
});

test("loadDocState is null for a note that was never saved", async () => {
  const [fresh] = await db.insert(note).values({ ownerId }).returning();
  if (!fresh) throw new Error("note insert failed");
  expect(await loadDocState(fresh.id)).toBeNull();
});

test("saveDerivedMetadata writes title + preview derived from the doc onto the note", async () => {
  const ydoc = buildDoc("My First Heading", "and the body text");
  await saveDerivedMetadata(noteId, ydoc);

  const [row] = await db
    .select({ title: note.title, preview: note.preview })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.title).toBe("My First Heading");
  expect(row?.preview).toBe("and the body text");
});
