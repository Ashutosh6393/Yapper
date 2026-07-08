import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, noteDoc, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import * as Y from "yjs";
import { buildApp } from "../app";

/**
 * Goal-state (spec 20): `PUT /api/notes/:id/content` persists a private note's body and derives its
 * title/preview server-side **without any socket** — proven by exercising the REST path only. Real Neon
 * via supertest with the `x-test-user-id` resolver.
 */

const app = buildApp({ skipAuth: true });
const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

/** base64(Y.encodeStateAsUpdate) of a doc whose `default` fragment is one paragraph per line. */
function encodeDoc(...lines: string[]): string {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  fragment.insert(
    0,
    lines.map((line) => {
      const p = new Y.XmlElement("paragraph");
      p.insert(0, [new Y.XmlText(line)]);
      return p;
    }),
  );
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}

let ownerId: string;
let viewerId: string;
let privateNoteId: string;
let sharedNoteId: string;

beforeAll(async () => {
  const mk = async (name: string) => {
    const [row] = await db
      .insert(user)
      .values({ name, email: `content-${name}-${crypto.randomUUID()}@example.com` })
      .returning();
    if (!row) throw new Error("user setup failed");
    return row.id;
  };
  ownerId = await mk("owner");
  viewerId = await mk("viewer");
  const [priv] = await db.insert(note).values({ ownerId }).returning(); // access private (default)
  const [shared] = await db
    .insert(note)
    .values({ ownerId, access: "view", shareToken: `content-${crypto.randomUUID()}` })
    .returning();
  if (!priv || !shared) throw new Error("note setup failed");
  privateNoteId = priv.id;
  sharedNoteId = shared.id;
  await db
    .insert(noteCollaborator)
    .values({ noteId: sharedNoteId, userId: viewerId, status: "active" });
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, viewerId));
});

test("private note persists + derives title/preview without a socket, bumping meta_version (goals #2, #4)", async () => {
  const res = await asUser(ownerId)(
    supertest(app)
      .put(`/api/notes/${privateNoteId}/content`)
      .send({ state: encodeDoc("Hello world", "the body text") }),
  );
  expect(res.status).toBe(204);

  const [row] = await db
    .select({ title: note.title, preview: note.preview, v: note.metaVersion })
    .from(note)
    .where(eq(note.id, privateNoteId));
  expect(row?.title).toBe("Hello world");
  expect(row?.preview).toBe("the body text");
  expect(row?.v).toBeGreaterThan(0); // bumped from the default 0

  const [doc] = await db
    .select({ noteId: noteDoc.noteId })
    .from(noteDoc)
    .where(eq(noteDoc.noteId, privateNoteId));
  expect(doc?.noteId).toBe(privateNoteId); // note_doc row written by the REST path
}, 30_000);

test("a second PUT upserts the same note_doc row and bumps meta_version again (goal, TDD #3)", async () => {
  const [before] = await db
    .select({ v: note.metaVersion })
    .from(note)
    .where(eq(note.id, privateNoteId));

  const res = await asUser(ownerId)(
    supertest(app)
      .put(`/api/notes/${privateNoteId}/content`)
      .send({ state: encodeDoc("Renamed title") }),
  );
  expect(res.status).toBe(204);

  const [after] = await db
    .select({ title: note.title, v: note.metaVersion })
    .from(note)
    .where(eq(note.id, privateNoteId));
  expect(after?.title).toBe("Renamed title");
  expect(after?.v ?? 0).toBeGreaterThan(before?.v ?? 0);

  const rows = await db
    .select({ noteId: noteDoc.noteId })
    .from(noteDoc)
    .where(eq(noteDoc.noteId, privateNoteId));
  expect(rows).toHaveLength(1); // upsert, not a duplicate row
}, 30_000);

test("a view-only collaborator cannot PUT content → 403 (goal #3)", async () => {
  const res = await asUser(viewerId)(
    supertest(app)
      .put(`/api/notes/${sharedNoteId}/content`)
      .send({ state: encodeDoc("Sneaky edit") }),
  );
  expect(res.status).toBe(403);
}, 30_000);

test("an unknown note id → 403 (deny-by-default; resolvePerm=none)", async () => {
  const res = await asUser(ownerId)(
    supertest(app)
      .put(`/api/notes/${crypto.randomUUID()}/content`)
      .send({ state: encodeDoc("nobody") }),
  );
  expect(res.status).toBe(403);
}, 30_000);

test("a malformed (non-base64) body → 400", async () => {
  const res = await asUser(ownerId)(
    supertest(app).put(`/api/notes/${privateNoteId}/content`).send({ state: "not base64!!" }),
  );
  expect(res.status).toBe(400);
}, 30_000);
