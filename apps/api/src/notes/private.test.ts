import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

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
  const res = await asUser(collaboratorId)(supertest(app).post(`/api/notes/${noteId}/private`));
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
