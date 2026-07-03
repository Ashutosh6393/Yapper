import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, user } from "@yapper/db";
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
let otherId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Label Owner", email: `lbl-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [other] = await db
    .insert(user)
    .values({ name: "Label Other", email: `lbl-other-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !other) throw new Error("user setup failed");
  ownerId = owner.id;
  otherId = other.id;
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, otherId));
});

async function newNote(): Promise<string> {
  const res = await request(app).post("/api/notes").set("x-test-user-id", ownerId);
  return res.body.id as string;
}

async function createLabel(name: string, color = "sky"): Promise<{ id: string }> {
  const res = await request(app)
    .post("/api/labels")
    .set("x-test-user-id", ownerId)
    .send({ name, color });
  expect(res.status).toBe(201);
  return res.body;
}

test("POST /api/labels creates a label; duplicate name for the same owner is 409", async () => {
  const res = await request(app)
    .post("/api/labels")
    .set("x-test-user-id", ownerId)
    .send({ name: "Work", color: "amber" });
  expect(res.status).toBe(201);
  expect(res.body.name).toBe("Work");
  expect(res.body.color).toBe("amber");
  expect(res.body.noteCount).toBe(0);

  const dup = await request(app)
    .post("/api/labels")
    .set("x-test-user-id", ownerId)
    .send({ name: "Work", color: "rose" });
  expect(dup.status).toBe(409);

  // An off-palette color is rejected at the boundary.
  const bad = await request(app)
    .post("/api/labels")
    .set("x-test-user-id", ownerId)
    .send({ name: "Nope", color: "fuchsia" });
  expect(bad.status).toBe(400);
});

test("GET /api/labels lists only the caller's labels, scoped by owner", async () => {
  const mineName = `Mine-${crypto.randomUUID().slice(0, 8)}`;
  await createLabel(mineName, "violet");

  // Another user's label is not visible to the owner.
  await request(app)
    .post("/api/labels")
    .set("x-test-user-id", otherId)
    .send({ name: "Theirs", color: "emerald" });

  const res = await request(app).get("/api/labels").set("x-test-user-id", ownerId);
  expect(res.status).toBe(200);
  const names = res.body.map((l: { name: string }) => l.name);
  expect(names).toContain(mineName);
  expect(names).not.toContain("Theirs");
});

test("PUT /api/notes/:id/labels replaces the note's set; only owner's labels are attached", async () => {
  const noteId = await newNote();
  const a = await createLabel(`A-${crypto.randomUUID().slice(0, 8)}`);
  const b = await createLabel(`B-${crypto.randomUUID().slice(0, 8)}`);

  // Attach both.
  const put1 = await request(app)
    .put(`/api/notes/${noteId}/labels`)
    .set("x-test-user-id", ownerId)
    .send({ labelIds: [a.id, b.id] });
  expect(put1.status).toBe(204);

  const listed = await request(app)
    .get("/api/notes")
    .set("x-test-user-id", ownerId)
    .then((r) => r.body.find((n: { id: string }) => n.id === noteId));
  expect(listed.labels.map((l: { id: string }) => l.id).sort()).toEqual([a.id, b.id].sort());

  // Replace with just A — B is removed.
  const put2 = await request(app)
    .put(`/api/notes/${noteId}/labels`)
    .set("x-test-user-id", ownerId)
    .send({ labelIds: [a.id] });
  expect(put2.status).toBe(204);
  const relisted = await request(app)
    .get("/api/notes")
    .set("x-test-user-id", ownerId)
    .then((r) => r.body.find((n: { id: string }) => n.id === noteId));
  expect(relisted.labels.map((l: { id: string }) => l.id)).toEqual([a.id]);

  // A foreign label id is silently ignored (not attached).
  const foreign = await request(app)
    .post("/api/labels")
    .set("x-test-user-id", otherId)
    .send({ name: `Foreign-${crypto.randomUUID().slice(0, 8)}`, color: "sky" });
  const put3 = await request(app)
    .put(`/api/notes/${noteId}/labels`)
    .set("x-test-user-id", ownerId)
    .send({ labelIds: [foreign.body.id] });
  expect(put3.status).toBe(204);
  const afterForeign = await request(app)
    .get("/api/notes")
    .set("x-test-user-id", ownerId)
    .then((r) => r.body.find((n: { id: string }) => n.id === noteId));
  expect(afterForeign.labels).toEqual([]);
});

test("GET /api/notes?label=<id> returns only active notes carrying that label", async () => {
  const withLabel = await newNote();
  const withoutLabel = await newNote();
  const l = await createLabel(`Filter-${crypto.randomUUID().slice(0, 8)}`);
  await request(app)
    .put(`/api/notes/${withLabel}/labels`)
    .set("x-test-user-id", ownerId)
    .send({ labelIds: [l.id] });

  const res = await request(app).get(`/api/notes?label=${l.id}`).set("x-test-user-id", ownerId);
  expect(res.status).toBe(200);
  expect(res.body.some((n: { id: string }) => n.id === withLabel)).toBe(true);
  expect(res.body.some((n: { id: string }) => n.id === withoutLabel)).toBe(false);
});

test("label note-count includes active notes only (drops on archive/trash, returns on restore)", async () => {
  const noteId = await newNote();
  const l = await createLabel(`Count-${crypto.randomUUID().slice(0, 8)}`);
  await request(app)
    .put(`/api/notes/${noteId}/labels`)
    .set("x-test-user-id", ownerId)
    .send({ labelIds: [l.id] });

  const countOf = async () => {
    const res = await request(app).get("/api/labels").set("x-test-user-id", ownerId);
    return res.body.find((x: { id: string }) => x.id === l.id)?.noteCount;
  };

  expect(await countOf()).toBe(1);

  await request(app).post(`/api/notes/${noteId}/archive`).set("x-test-user-id", ownerId);
  expect(await countOf()).toBe(0);

  await request(app).post(`/api/notes/${noteId}/unarchive`).set("x-test-user-id", ownerId);
  expect(await countOf()).toBe(1);

  await request(app).post(`/api/notes/${noteId}/trash`).set("x-test-user-id", ownerId);
  expect(await countOf()).toBe(0);

  // The label persists through trash and its link survives (reappears on restore).
  await request(app).post(`/api/notes/${noteId}/restore`).set("x-test-user-id", ownerId);
  expect(await countOf()).toBe(1);
});

test("DELETE /api/labels/:id is owner-gated and removes the label", async () => {
  const l = await createLabel(`Del-${crypto.randomUUID().slice(0, 8)}`);

  const forbidden = await request(app).delete(`/api/labels/${l.id}`).set("x-test-user-id", otherId);
  expect(forbidden.status).toBe(403);

  const ok = await request(app).delete(`/api/labels/${l.id}`).set("x-test-user-id", ownerId);
  expect(ok.status).toBe(204);

  const res = await request(app).get("/api/labels").set("x-test-user-id", ownerId);
  expect(res.body.some((x: { id: string }) => x.id === l.id)).toBe(false);
});
