import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../app";
import type { SessionResolver } from "../auth/requireAuth";

const resolveSession: SessionResolver = async (req) => {
  const id = req.header("x-test-user-id");
  return id && id.length > 0 ? id : null;
};

const app = createApp({ resolveSession });

let ownerId: string;
let collaboratorId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "LC Owner", email: `lc-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [collab] = await db
    .insert(user)
    .values({ name: "LC Collab", email: `lc-collab-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !collab) throw new Error("user setup failed");
  ownerId = owner.id;
  collaboratorId = collab.id;
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, collaboratorId));
});

async function newNote(): Promise<string> {
  const res = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  return res.body.id as string;
}

function list(filter?: string, labelId?: string) {
  const q = new URLSearchParams();
  if (filter) q.set("filter", filter);
  if (labelId) q.set("label", labelId);
  const path = q.toString() ? `/api/notes?${q}` : "/api/notes";
  return request(app).get(path).set("x-test-user-id", ownerId);
}

const has = (body: { id: string }[], id: string) => body.some((n) => n.id === id);

test("default list is active-only: archived and trashed notes are excluded", async () => {
  const active = await newNote();
  const archived = await newNote();
  const trashed = await newNote();
  await request(app).post(`/api/notes/${archived}/archive`).set("x-test-user-id", ownerId);
  await request(app).post(`/api/notes/${trashed}/trash`).set("x-test-user-id", ownerId);

  const res = await list();
  expect(res.status).toBe(200);
  expect(has(res.body, active)).toBe(true);
  expect(has(res.body, archived)).toBe(false);
  expect(has(res.body, trashed)).toBe(false);
});

test("archive → shows only in ?filter=archived; unarchive returns it to active", async () => {
  const id = await newNote();
  const archiveRes = await request(app)
    .post(`/api/notes/${id}/archive`)
    .set("x-test-user-id", ownerId);
  expect(archiveRes.status).toBe(204);

  expect(has((await list("archived")).body, id)).toBe(true);
  expect(has((await list()).body, id)).toBe(false);

  const unarchiveRes = await request(app)
    .post(`/api/notes/${id}/unarchive`)
    .set("x-test-user-id", ownerId);
  expect(unarchiveRes.status).toBe(204);
  expect(has((await list()).body, id)).toBe(true);
  expect(has((await list("archived")).body, id)).toBe(false);
});

test("trash → shows only in ?filter=trashed; restore returns it to active", async () => {
  const id = await newNote();
  const trashRes = await request(app).post(`/api/notes/${id}/trash`).set("x-test-user-id", ownerId);
  expect(trashRes.status).toBe(204);

  expect(has((await list("trashed")).body, id)).toBe(true);
  expect(has((await list()).body, id)).toBe(false);

  const restoreRes = await request(app)
    .post(`/api/notes/${id}/restore`)
    .set("x-test-user-id", ownerId);
  expect(restoreRes.status).toBe(204);
  expect(has((await list()).body, id)).toBe(true);
  expect(has((await list("trashed")).body, id)).toBe(false);
});

test("restore clears both timestamps (archived then trashed → active on restore)", async () => {
  const id = await newNote();
  await request(app).post(`/api/notes/${id}/archive`).set("x-test-user-id", ownerId);
  await request(app).post(`/api/notes/${id}/trash`).set("x-test-user-id", ownerId);
  await request(app).post(`/api/notes/${id}/restore`).set("x-test-user-id", ownerId);

  const [row] = await db
    .select({ archivedAt: note.archivedAt, trashedAt: note.trashedAt })
    .from(note)
    .where(eq(note.id, id));
  expect(row?.archivedAt).toBeNull();
  expect(row?.trashedAt).toBeNull();
});

test("lifecycle routes are owner-gated (403 for non-owner, 404 for missing)", async () => {
  const id = await newNote();
  const forbidden = await request(app)
    .post(`/api/notes/${id}/trash`)
    .set("x-test-user-id", collaboratorId);
  expect(forbidden.status).toBe(403);

  const missing = await request(app)
    .post(`/api/notes/${crypto.randomUUID()}/archive`)
    .set("x-test-user-id", ownerId);
  expect(missing.status).toBe(404);
});

test("GET /api/notes/shared excludes a note the owner has trashed", async () => {
  const id = await newNote();
  const shared = await request(app)
    .post(`/api/notes/${id}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });
  await request(app)
    .post(`/api/share/${shared.body.token}/join`)
    .set("x-test-user-id", collaboratorId);

  // Visible before trashing.
  expect(
    has(
      (await request(app).get("/api/notes/shared").set("x-test-user-id", collaboratorId)).body,
      id,
    ),
  ).toBe(true);

  await request(app).post(`/api/notes/${id}/trash`).set("x-test-user-id", ownerId);

  // Gone from the collaborator's "Shared with me" once trashed.
  expect(
    has(
      (await request(app).get("/api/notes/shared").set("x-test-user-id", collaboratorId)).body,
      id,
    ),
  ).toBe(false);

  // Collaborator can no longer read the note metadata (resolvePerm → none).
  const read = await request(app).get(`/api/notes/${id}`).set("x-test-user-id", collaboratorId);
  expect(read.status).toBe(403);

  // Restore brings it back for the collaborator.
  await request(app).post(`/api/notes/${id}/restore`).set("x-test-user-id", ownerId);
  expect(
    has(
      (await request(app).get("/api/notes/shared").set("x-test-user-id", collaboratorId)).body,
      id,
    ),
  ).toBe(true);

  // Clean up the collaborator row so afterAll cascade is tidy.
  await db.delete(noteCollaborator).where(eq(noteCollaborator.noteId, id));
});
