import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, syncClient, user } from "@yapper/db";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

const app = buildApp({ skipAuth: true });
let ownerId: string;
let strangerId: string;

const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Verdict Owner", email: `push-verd-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [stranger] = await db
    .insert(user)
    .values({ name: "Stranger", email: `push-verd-str-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !stranger) throw new Error("user setup failed");
  ownerId = owner.id;
  strangerId = stranger.id;
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, strangerId));
});

test("renameNote on a note the caller doesn't own → rejected(forbidden), pointer advanced, title unchanged (goal #9)", async () => {
  const clientGroupID = crypto.randomUUID();
  // A note owned by the owner; the stranger will try to rename it.
  const [n] = await db.insert(note).values({ ownerId, title: "Original" }).returning();
  if (!n) throw new Error("note setup failed");

  const res = await asUser(strangerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID,
        mutations: [{ seq: 1, name: "renameNote", args: { id: n.id, title: "Hacked" } }],
      }),
  );

  expect(res.status).toBe(200);
  expect(res.body.verdicts).toEqual([{ seq: 1, status: "rejected", reason: "forbidden" }]);
  // Pointer advanced (poison mutation dropped, never retried) even though nothing applied.
  expect(res.body.lastMutationID).toBe(1);
  const [pointer] = await db
    .select({ last: syncClient.lastMutationId })
    .from(syncClient)
    .where(eq(syncClient.clientGroupId, clientGroupID));
  expect(pointer?.last).toBe(1);
  // Title unchanged.
  const [row] = await db.select({ title: note.title }).from(note).where(eq(note.id, n.id));
  expect(row?.title).toBe("Original");

  await db.delete(note).where(eq(note.id, n.id));
}, 30_000);

test("permanentDeleteNote on a non-trashed note → rejected(conflict); a valid sibling → applied (goal #9)", async () => {
  const clientGroupID = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  const res = await asUser(ownerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID,
        mutations: [
          { seq: 1, name: "createNote", args: { id: noteId } },
          // Active note (never trashed) → permanent delete is an illegal-state conflict.
          { seq: 2, name: "permanentDeleteNote", args: { id: noteId } },
          { seq: 3, name: "renameNote", args: { id: noteId, title: "Kept" } },
        ],
      }),
  );

  expect(res.status).toBe(200);
  expect(res.body.verdicts).toEqual([
    { seq: 1, status: "applied" },
    { seq: 2, status: "rejected", reason: "conflict" },
    { seq: 3, status: "applied" },
  ]);
  const [row] = await db.select({ title: note.title }).from(note).where(eq(note.id, noteId));
  expect(row?.title).toBe("Kept");

  await db.delete(note).where(eq(note.id, noteId));
}, 30_000);

test("an unexpected (non-MutationRejected) error 5xx's and does not advance the pointer past the failure (goal #9)", async () => {
  const clientGroupID = crypto.randomUUID();
  const validId = crypto.randomUUID();

  // seq 2's id is not a valid uuid: it passes the wire schema (args.id is a string) but the note.id
  // column is uuid, so the INSERT throws a DB error — an UNEXPECTED failure, not a MutationRejected.
  const res = await asUser(ownerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID,
        mutations: [
          { seq: 1, name: "createNote", args: { id: validId } },
          { seq: 2, name: "createNote", args: { id: "not-a-uuid" } },
        ],
      }),
  );

  expect(res.status).toBeGreaterThanOrEqual(500);
  expect(res.body.verdicts).toBeUndefined(); // no partial verdicts leaked
  // seq 1 committed in its own txn; the pointer is at 1, NOT advanced past the failed seq 2.
  const [pointer] = await db
    .select({ last: syncClient.lastMutationId })
    .from(syncClient)
    .where(eq(syncClient.clientGroupId, clientGroupID));
  expect(pointer?.last).toBe(1);

  await db.delete(note).where(eq(note.id, validId));
}, 30_000);
