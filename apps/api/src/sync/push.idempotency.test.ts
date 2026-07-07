import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

const app = buildApp({ skipAuth: true });
let ownerId: string;

const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Idem Owner", email: `push-idem-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
});

test("re-pushing an already-applied batch is a no-op (goal #8)", async () => {
  const clientGroupID = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const batch = {
    clientGroupID,
    mutations: [
      { seq: 1, name: "createNote", args: { id: noteId } },
      { seq: 2, name: "archiveNote", args: { id: noteId } },
    ],
  };

  const first = await asUser(ownerId)(supertest(app).post("/api/sync/push").send(batch));
  expect(first.status).toBe(200);
  expect(first.body.lastMutationID).toBe(2);

  const [afterFirst] = await db
    .select({ archivedAt: note.archivedAt, metaVersion: note.metaVersion })
    .from(note)
    .where(eq(note.id, noteId));
  expect(afterFirst?.archivedAt).not.toBeNull();
  // createNote v0 → archiveNote +1 = 1.
  expect(afterFirst?.metaVersion).toBe(1);

  // Same batch again: every seq <= last_mutation_id → skipped, verdict applied, nothing re-executed.
  const second = await asUser(ownerId)(supertest(app).post("/api/sync/push").send(batch));
  expect(second.status).toBe(200);
  expect(second.body.lastMutationID).toBe(2);
  expect(second.body.verdicts).toEqual([
    { seq: 1, status: "applied" },
    { seq: 2, status: "applied" },
  ]);

  // Exactly one note row (no duplicate create) and meta_version NOT bumped again.
  const rows = await db
    .select({ metaVersion: note.metaVersion })
    .from(note)
    .where(eq(note.id, noteId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.metaVersion).toBe(1);
}, 30_000);
