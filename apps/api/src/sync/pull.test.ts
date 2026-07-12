import { afterAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, syncClient, syncCvr, user } from "@yapper/db";
import { eq, inArray } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

/**
 * Goal-state tests for `POST /api/sync/pull` (spec 16). Metadata changes are driven by writing
 * `note.access` / `note_collaborator.status` / `note.meta_version` directly — isolating the puller from
 * the spec-19 mutators. Each test uses a fresh owner so "the whole authorized view" is deterministic,
 * and a random client-group id so CVR rows never collide across tests.
 */

const app = buildApp({ skipAuth: true });
const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

const createdUsers: string[] = [];
const usedGroups: string[] = [];

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({ name: label, email: `pull-${label}-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!row) throw new Error("user setup failed");
  createdUsers.push(row.id);
  return row.id;
}

async function makeNote(ownerId: string, overrides: Partial<typeof note.$inferInsert> = {}) {
  const [row] = await db
    .insert(note)
    .values({ ownerId, ...overrides })
    .returning();
  if (!row) throw new Error("note setup failed");
  return row;
}

function newGroup(): string {
  const g = crypto.randomUUID();
  usedGroups.push(g);
  return g;
}

async function pull(userId: string, clientGroupID: string, cookie: string | null) {
  return asUser(userId)(supertest(app).post("/api/sync/pull").send({ clientGroupID, cookie }));
}

afterAll(async () => {
  if (usedGroups.length > 0) {
    await db.delete(syncCvr).where(inArray(syncCvr.clientGroupId, usedGroups));
    await db.delete(syncClient).where(inArray(syncClient.clientGroupId, usedGroups));
  }
  for (const id of createdUsers) await db.delete(user).where(eq(user.id, id));
});

test("first pull (cookie null) returns the whole view in puts, empty dels, reset true, a cookie, and stores a CVR row (goals #10, TDD #1)", async () => {
  const owner = await makeUser("first");
  const n = await makeNote(owner, { title: "Hello", metaVersion: 1 });
  const group = newGroup();

  const res = await pull(owner, group, null);

  expect(res.status).toBe(200);
  expect(res.body.puts.map((p: { id: string }) => p.id)).toEqual([n.id]);
  expect(res.body.dels).toEqual([]);
  expect(res.body.reset).toBe(true);
  expect(typeof res.body.cookie).toBe("string");

  // A CVR row was stored for the freshly issued cookie with the note's metaVersion.
  const [row] = await db
    .select({ snapshot: syncCvr.snapshot })
    .from(syncCvr)
    .where(eq(syncCvr.cookie, Number(res.body.cookie)));
  expect(row?.snapshot[n.id]).toBe(1);
}, 30_000);

test("delta: only a note whose meta_version was bumped reappears in puts (TDD #2)", async () => {
  const owner = await makeUser("delta");
  const a = await makeNote(owner, { metaVersion: 1 });
  const b = await makeNote(owner, { metaVersion: 1 });
  const group = newGroup();

  const first = await pull(owner, group, null);
  expect(new Set(first.body.puts.map((p: { id: string }) => p.id))).toEqual(new Set([a.id, b.id]));

  await db.update(note).set({ metaVersion: 2 }).where(eq(note.id, a.id));
  const second = await pull(owner, group, first.body.cookie);

  expect(second.body.puts.map((p: { id: string }) => p.id)).toEqual([a.id]);
  expect(second.body.reset).toBeFalsy();
}, 30_000);

test("delta: a newly inserted owned note appears in puts (TDD #3)", async () => {
  const owner = await makeUser("newrow");
  await makeNote(owner, { metaVersion: 1 });
  const group = newGroup();
  const first = await pull(owner, group, null);

  const fresh = await makeNote(owner, { metaVersion: 1 });
  const second = await pull(owner, group, first.body.cookie);

  expect(second.body.puts.map((p: { id: string }) => p.id)).toEqual([fresh.id]);
}, 30_000);

test("puts carry isOwner: true for the caller's own notes, false for a note shared with them (spec 16)", async () => {
  const owner = await makeUser("own-flag");
  const collab = await makeUser("own-collab");
  const n = await makeNote(owner, {
    access: "edit",
    shareToken: `pull-own-${crypto.randomUUID()}`,
    metaVersion: 1,
  });
  await db.insert(noteCollaborator).values({ noteId: n.id, userId: collab, status: "active" });

  const ownerPull = await pull(owner, newGroup(), null);
  expect(ownerPull.body.puts.find((p: { id: string }) => p.id === n.id)?.isOwner).toBe(true);

  const collabPull = await pull(collab, newGroup(), null);
  expect(collabPull.body.puts.find((p: { id: string }) => p.id === n.id)?.isOwner).toBe(false);
}, 30_000);

test("removal make-private: collaborator gets the note in dels; owner does not (goal #7, TDD #4)", async () => {
  const owner = await makeUser("mp-owner");
  const collab = await makeUser("mp-collab");
  const n = await makeNote(owner, {
    access: "edit",
    shareToken: `pull-mp-${crypto.randomUUID()}`,
    metaVersion: 1,
  });
  await db.insert(noteCollaborator).values({ noteId: n.id, userId: collab, status: "active" });
  const ownerGroup = newGroup();
  const collabGroup = newGroup();

  const ownerFirst = await pull(owner, ownerGroup, null);
  const collabFirst = await pull(collab, collabGroup, null);
  expect(collabFirst.body.puts.map((p: { id: string }) => p.id)).toEqual([n.id]);

  // Owner makes it private: access→private + collaborators revoked (mirrors makeNotePrivate), bump.
  await db.update(note).set({ access: "private", metaVersion: 2 }).where(eq(note.id, n.id));
  await db
    .update(noteCollaborator)
    .set({ status: "revoked" })
    .where(eq(noteCollaborator.noteId, n.id));

  const collabSecond = await pull(collab, collabGroup, collabFirst.body.cookie);
  expect(collabSecond.body.dels).toContain(n.id);

  const ownerSecond = await pull(owner, ownerGroup, ownerFirst.body.cookie);
  expect(ownerSecond.body.dels).not.toContain(n.id); // still owns it
}, 30_000);

test("removal revoke: a revoked collaborator gets the note in dels (goal #8, TDD #5)", async () => {
  const owner = await makeUser("rv-owner");
  const collab = await makeUser("rv-collab");
  const n = await makeNote(owner, {
    access: "edit",
    shareToken: `pull-rv-${crypto.randomUUID()}`,
    metaVersion: 1,
  });
  await db.insert(noteCollaborator).values({ noteId: n.id, userId: collab, status: "active" });
  const group = newGroup();

  const first = await pull(collab, group, null);
  expect(first.body.puts.map((p: { id: string }) => p.id)).toEqual([n.id]);

  await db
    .update(noteCollaborator)
    .set({ status: "revoked" })
    .where(eq(noteCollaborator.noteId, n.id));
  const second = await pull(collab, group, first.body.cookie);
  expect(second.body.dels).toContain(n.id);
}, 30_000);

test("removal hard-delete: a deleted note leaves the view in dels (goal #9, TDD #6)", async () => {
  const owner = await makeUser("del-owner");
  const n = await makeNote(owner, { metaVersion: 1 });
  const group = newGroup();

  const first = await pull(owner, group, null);
  expect(first.body.puts.map((p: { id: string }) => p.id)).toEqual([n.id]);

  await db.delete(note).where(eq(note.id, n.id));
  const second = await pull(owner, group, first.body.cookie);
  expect(second.body.dels).toContain(n.id);
}, 30_000);

test("full resync on an unknown cookie: whole view in puts, empty dels, reset true (goal #10, TDD #7)", async () => {
  const owner = await makeUser("resync");
  const n = await makeNote(owner, { metaVersion: 1 });
  const group = newGroup();

  // Establish a real cookie, then present a bogus one the server can't find.
  await pull(owner, group, null);
  const res = await pull(owner, group, "999999999");

  expect(res.body.puts.map((p: { id: string }) => p.id)).toEqual([n.id]);
  expect(res.body.dels).toEqual([]);
  expect(res.body.reset).toBe(true);
}, 30_000);

test("lastMutationID is echoed from sync_client (0 when absent) (TDD #8)", async () => {
  const owner = await makeUser("lmid");
  await makeNote(owner, { metaVersion: 1 });
  const group = newGroup();

  const absent = await pull(owner, group, null);
  expect(absent.body.lastMutationID).toBe(0);

  await db.insert(syncClient).values({ clientGroupId: group, userId: owner, lastMutationId: 7 });
  const present = await pull(owner, group, absent.body.cookie);
  expect(present.body.lastMutationID).toBe(7);
}, 30_000);
