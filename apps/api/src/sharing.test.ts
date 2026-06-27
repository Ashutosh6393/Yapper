import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "./app";
import type { SessionResolver } from "./auth/requireAuth";

/** A request is "authenticated as" whoever it names in `x-test-user-id` (stands in for the cookie). */
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
    .values({ name: "Owner", email: `share-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [collab] = await db
    .insert(user)
    .values({ name: "Collab", email: `share-collab-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !collab) throw new Error("user setup failed");
  ownerId = owner.id;
  collaboratorId = collab.id;
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, collaboratorId));
});

/** Create a fresh owned note and return its id. */
async function newNote(): Promise<string> {
  const res = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  return res.body.id as string;
}

test("owner enables view sharing → gets a token + link, note.access becomes view", async () => {
  const noteId = await newNote();

  const res = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });

  expect(res.status).toBe(200);
  expect(res.body.token).toBeString();
  expect(res.body.token.length).toBeGreaterThan(16);
  expect(res.body.access).toBe("view");
  expect(res.body.url).toContain(`/share/${res.body.token}`);

  const [row] = await db
    .select({ access: note.access, shareToken: note.shareToken })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.access).toBe("view");
  expect(row?.shareToken).toBe(res.body.token);
});

test("changing the level to edit keeps the same token", async () => {
  const noteId = await newNote();
  const first = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });
  const second = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "edit" });

  expect(second.status).toBe(200);
  expect(second.body.access).toBe("edit");
  expect(second.body.token).toBe(first.body.token);
});

test("non-owner cannot share; invalid level is rejected", async () => {
  const noteId = await newNote();

  const forbidden = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", collaboratorId)
    .send({ level: "view" });
  expect(forbidden.status).toBe(403);

  const bad = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "owner" });
  expect(bad.status).toBe(400);
});

test("GET /api/share/:token returns a note summary for the join page", async () => {
  const noteId = await newNote();
  const shared = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });
  const token = shared.body.token;

  const res = await request(app).get(`/api/share/${token}`).set("x-test-user-id", collaboratorId);
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(noteId);
  expect(res.body.access).toBe("view");

  const missing = await request(app)
    .get(`/api/share/does-not-exist`)
    .set("x-test-user-id", collaboratorId);
  expect(missing.status).toBe(404);
});

test("joining via the token materializes an active collaborator and returns the note id", async () => {
  const noteId = await newNote();
  const shared = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "edit" });
  const token = shared.body.token;

  const res = await request(app)
    .post(`/api/share/${token}/join`)
    .set("x-test-user-id", collaboratorId);
  expect(res.status).toBe(200);
  expect(res.body.noteId).toBe(noteId);

  const [row] = await db
    .select({ status: noteCollaborator.status })
    .from(noteCollaborator)
    .where(and(eq(noteCollaborator.noteId, noteId), eq(noteCollaborator.userId, collaboratorId)));
  expect(row?.status).toBe("active");

  // Joining again is idempotent (no duplicate row, still 200).
  const again = await request(app)
    .post(`/api/share/${token}/join`)
    .set("x-test-user-id", collaboratorId);
  expect(again.status).toBe(200);
  const rows = await db
    .select()
    .from(noteCollaborator)
    .where(and(eq(noteCollaborator.noteId, noteId), eq(noteCollaborator.userId, collaboratorId)));
  expect(rows).toHaveLength(1);
});

test("joining with an unknown token is 404", async () => {
  const res = await request(app)
    .post(`/api/share/nope-not-a-token/join`)
    .set("x-test-user-id", collaboratorId);
  expect(res.status).toBe(404);
});

test("a joined collaborator can read the note metadata; a stranger cannot", async () => {
  const noteId = await newNote();
  const shared = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });
  await request(app)
    .post(`/api/share/${shared.body.token}/join`)
    .set("x-test-user-id", collaboratorId);

  const asCollab = await request(app)
    .get(`/api/notes/${noteId}`)
    .set("x-test-user-id", collaboratorId);
  expect(asCollab.status).toBe(200);
  expect(asCollab.body.id).toBe(noteId);

  // A user who never joined still gets 403.
  const [stranger] = await db
    .insert(user)
    .values({ name: "Stranger", email: `share-stranger-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!stranger) throw new Error("stranger setup failed");
  const asStranger = await request(app)
    .get(`/api/notes/${noteId}`)
    .set("x-test-user-id", stranger.id);
  expect(asStranger.status).toBe(403);
  await db.delete(user).where(eq(user.id, stranger.id));
});

test("GET /api/notes/shared lists joined notes for the collaborator, not for the owner", async () => {
  const noteId = await newNote();
  const shared = await request(app)
    .post(`/api/notes/${noteId}/share`)
    .set("x-test-user-id", ownerId)
    .send({ level: "view" });
  await request(app)
    .post(`/api/share/${shared.body.token}/join`)
    .set("x-test-user-id", collaboratorId);

  const mine = await request(app).get("/api/notes/shared").set("x-test-user-id", collaboratorId);
  expect(mine.status).toBe(200);
  expect(mine.body.some((n: { id: string }) => n.id === noteId)).toBe(true);
  // Metadata only — never the CRDT blob.
  const found = mine.body.find((n: { id: string }) => n.id === noteId);
  expect(Object.keys(found).sort()).toEqual(["access", "id", "preview", "title", "updatedAt"]);

  // The owner's "shared with me" does not include their own note.
  const ownerShared = await request(app).get("/api/notes/shared").set("x-test-user-id", ownerId);
  expect(ownerShared.body.some((n: { id: string }) => n.id === noteId)).toBe(false);
});
