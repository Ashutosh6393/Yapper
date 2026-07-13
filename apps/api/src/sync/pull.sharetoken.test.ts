import { afterAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, syncClient, syncCvr, user } from "@yapper/db";
import { eq, inArray } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

/**
 * The share token has to reach the *owner* through the pull, or the note dialog can never show a "Copy
 * link" button on the sync-engine path: the token is minted server-side (`setShareLevel` mutator) and
 * `NoteMeta` was the client's only channel for note metadata.
 *
 * It must NOT reach collaborators. The token is a capability — possession grants access — so it rides
 * only on rows where the caller is the owner.
 */

const app = buildApp({ skipAuth: true });
const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

const createdUsers: string[] = [];
const usedGroups: string[] = [];

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({ name: label, email: `token-${label}-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!row) throw new Error("user setup failed");
  createdUsers.push(row.id);
  return row.id;
}

function newGroup(): string {
  const g = crypto.randomUUID();
  usedGroups.push(g);
  return g;
}

async function pull(userId: string, clientGroupID: string) {
  return asUser(userId)(
    supertest(app).post("/api/sync/pull").send({ clientGroupID, cookie: null }),
  );
}

afterAll(async () => {
  if (usedGroups.length > 0) {
    await db.delete(syncCvr).where(inArray(syncCvr.clientGroupId, usedGroups));
    await db.delete(syncClient).where(inArray(syncClient.clientGroupId, usedGroups));
  }
  for (const id of createdUsers) await db.delete(user).where(eq(user.id, id));
});

test("the owner's pull carries the share token, so the dialog can build the capability link", async () => {
  const owner = await makeUser("owner");
  const [n] = await db
    .insert(note)
    .values({ ownerId: owner, access: "edit", shareToken: "tok_abc123", metaVersion: 1 })
    .returning();
  if (!n) throw new Error("note setup failed");

  const res = await pull(owner, newGroup());

  expect(res.status).toBe(200);
  const put = res.body.puts.find((p: { id: string }) => p.id === n.id);
  expect(put.shareToken).toBe("tok_abc123");
}, 30_000);

test("a collaborator's pull never carries the share token (it is a capability)", async () => {
  const owner = await makeUser("tokowner");
  const collaborator = await makeUser("collab");
  const [n] = await db
    .insert(note)
    .values({ ownerId: owner, access: "edit", shareToken: "tok_secret", metaVersion: 1 })
    .returning();
  if (!n) throw new Error("note setup failed");
  await db
    .insert(noteCollaborator)
    .values({ noteId: n.id, userId: collaborator, status: "active" });

  const res = await pull(collaborator, newGroup());

  expect(res.status).toBe(200);
  const put = res.body.puts.find((p: { id: string }) => p.id === n.id);
  expect(put.isOwner).toBe(false);
  expect(put.shareToken).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain("tok_secret");
}, 30_000);

test("a private note carries no token (make-private cleared it)", async () => {
  const owner = await makeUser("privowner");
  const [n] = await db
    .insert(note)
    .values({ ownerId: owner, access: "private", shareToken: null, metaVersion: 1 })
    .returning();
  if (!n) throw new Error("note setup failed");

  const res = await pull(owner, newGroup());

  const put = res.body.puts.find((p: { id: string }) => p.id === n.id);
  expect(put.shareToken ?? null).toBeNull();
}, 30_000);
