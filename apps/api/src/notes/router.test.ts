import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteDoc, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../app";
import type { SessionResolver } from "../auth/requireAuth";

/**
 * Test resolver: a request is "authenticated as" whoever it names in `x-test-user-id`.
 * This stands in for the Better Auth cookie so routes can be exercised without real OAuth.
 */
const resolveSession: SessionResolver = async (req) => {
  const id = req.header("x-test-user-id");
  return id && id.length > 0 ? id : null;
};

const app = createApp({ resolveSession });

let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [other] = await db
    .insert(user)
    .values({ name: "Other", email: `other-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !other) throw new Error("user setup failed");
  ownerId = owner.id;
  otherId = other.id;
}, 30_000);

afterAll(async () => {
  // Cascades delete every note (and note_doc) owned by these users. (Pool drained globally — see
  // test-setup.ts.)
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, otherId));
});

test("unauthenticated request is rejected with 401", async () => {
  const res = await request(app).get("/api/notes");
  expect(res.status).toBe(401);
});

test("POST /api/notes creates an owned note with Untitled/private defaults", async () => {
  const res = await request(app).post("/api/notes").set("x-test-user-id", ownerId);

  expect(res.status).toBe(201);
  expect(res.body.id).toBeString();
  expect(res.body.title).toBe("Untitled");
  expect(res.body.access).toBe("private");
  expect(res.body.updatedAt).toBeString();

  // Persisted with the caller as owner.
  const [row] = await db.select().from(note).where(eq(note.id, res.body.id));
  expect(row?.ownerId).toBe(ownerId);
});

test("GET /api/notes lists only the caller's notes, metadata only", async () => {
  const created = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  const noteId = created.body.id;

  const mine = await request(app).get("/api/notes").set("x-test-user-id", ownerId);
  expect(mine.status).toBe(200);
  const found = mine.body.find((n: { id: string }) => n.id === noteId);
  expect(found).toBeDefined();
  // List returns metadata only (+access +labels) — never the CRDT blob.
  expect(Object.keys(found).sort()).toEqual([
    "access",
    "id",
    "labels",
    "preview",
    "title",
    "updatedAt",
  ]);
  expect(found.access).toBe("private");
  expect(found.labels).toEqual([]);
  expect(found.state).toBeUndefined();

  // The other user does not see it.
  const theirs = await request(app).get("/api/notes").set("x-test-user-id", otherId);
  expect(theirs.body.some((n: { id: string }) => n.id === noteId)).toBe(false);
});

test("GET /api/notes/:id returns 200 for owner, 403 for non-owner, 404 for missing", async () => {
  const created = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  const noteId = created.body.id;

  const asOwner = await request(app).get(`/api/notes/${noteId}`).set("x-test-user-id", ownerId);
  expect(asOwner.status).toBe(200);
  expect(asOwner.body.id).toBe(noteId);
  expect(asOwner.body.ownerId).toBeUndefined(); // ownerId is not leaked in the response

  const asOther = await request(app).get(`/api/notes/${noteId}`).set("x-test-user-id", otherId);
  expect(asOther.status).toBe(403);

  const missing = await request(app)
    .get(`/api/notes/${crypto.randomUUID()}`)
    .set("x-test-user-id", ownerId);
  expect(missing.status).toBe(404);
});

test("DELETE /api/notes/:id is guarded: 409 unless trashed, then cascades note_doc", async () => {
  const created = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  const noteId = created.body.id;
  // Give it a CRDT doc so we can prove the cascade.
  await db.insert(noteDoc).values({ noteId, state: Buffer.from([1, 2, 3]) });

  // Permanent delete is refused while the note is still active (must be trashed first).
  const guarded = await request(app).delete(`/api/notes/${noteId}`).set("x-test-user-id", ownerId);
  expect(guarded.status).toBe(409);

  // Move it to trash.
  await request(app).post(`/api/notes/${noteId}/trash`).set("x-test-user-id", ownerId);

  // Non-owner still cannot delete.
  const forbidden = await request(app)
    .delete(`/api/notes/${noteId}`)
    .set("x-test-user-id", otherId);
  expect(forbidden.status).toBe(403);

  // Owner deletes a trashed note successfully.
  const ok = await request(app).delete(`/api/notes/${noteId}`).set("x-test-user-id", ownerId);
  expect(ok.status).toBe(204);

  const noteRows = await db.select().from(note).where(eq(note.id, noteId));
  expect(noteRows).toHaveLength(0);
  const docRows = await db.select().from(noteDoc).where(eq(noteDoc.noteId, noteId));
  expect(docRows).toHaveLength(0); // cascaded
});
