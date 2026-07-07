import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../app";
import type { SessionResolver } from "../auth/requireAuth";

/** Same fake resolver as router.test.ts: `x-test-user-id` stands in for the Better Auth session. */
const resolveSession: SessionResolver = async (req) => {
  const id = req.header("x-test-user-id");
  return id && id.length > 0 ? id : null;
};

const app = createApp({ resolveSession });

let userA: string;
let userB: string;

beforeAll(async () => {
  const [a] = await db
    .insert(user)
    .values({ name: "A", email: `a-${crypto.randomUUID()}@example.com` })
    .returning();
  const [b] = await db
    .insert(user)
    .values({ name: "B", email: `b-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!a || !b) throw new Error("user setup failed");
  userA = a.id;
  userB = b.id;
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userA));
  await db.delete(user).where(eq(user.id, userB));
});

test("POST /api/notes with a client-minted id is idempotent (same id twice → one row, both 201)", async () => {
  const id = crypto.randomUUID();

  const first = await request(app).post("/api/notes").set("x-test-user-id", userA).send({ id });
  expect(first.status).toBe(201);
  expect(first.body.id).toBe(id);

  const second = await request(app).post("/api/notes").set("x-test-user-id", userA).send({ id });
  expect(second.status).toBe(201);
  expect(second.body.id).toBe(id);

  // Exactly one row exists for that id — the second call was a no-op, not a duplicate or a 500.
  const rows = await db.select({ id: note.id }).from(note).where(eq(note.id, id));
  expect(rows).toHaveLength(1);
});

test("POST /api/notes with a malformed id is rejected 422 and creates no row", async () => {
  const res = await request(app)
    .post("/api/notes")
    .set("x-test-user-id", userA)
    .send({ id: "not-a-uuid" });
  expect(res.status).toBe(422);

  const rows = await db.select({ id: note.id }).from(note).where(eq(note.ownerId, userA));
  // No note with a bogus id — the malformed create never touched the table.
  expect(rows.every((r) => r.id !== "not-a-uuid")).toBe(true);
});

test("POST /api/notes with an id owned by another user is a permanent 409 (no overwrite)", async () => {
  const id = crypto.randomUUID();

  const mine = await request(app).post("/api/notes").set("x-test-user-id", userA).send({ id });
  expect(mine.status).toBe(201);

  const theirs = await request(app).post("/api/notes").set("x-test-user-id", userB).send({ id });
  expect(theirs.status).toBe(409);

  // The existing row is untouched — still owned by A.
  const [row] = await db.select({ ownerId: note.ownerId }).from(note).where(eq(note.id, id));
  expect(row?.ownerId).toBe(userA);
});

test("POST /api/notes with no id server-generates one (flag-off back-compat)", async () => {
  const res = await request(app).post("/api/notes").set("x-test-user-id", userA).send({});
  expect(res.status).toBe(201);
  expect(res.body.id).toBeString();
  expect(res.body.title).toBe("Untitled");
  expect(res.body.access).toBe("private");
});
