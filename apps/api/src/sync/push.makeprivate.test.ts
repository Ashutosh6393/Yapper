import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { revokeChannel } from "@yapper/permissions";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

// Capture Redis publishes so we can assert the revoke fired after commit (mirrors private.test.ts).
const published: { channel: string; payload: string }[] = [];
const app = buildApp({
  skipAuth: true,
  syncDeps: {
    permCache: null,
    publisher: {
      publish: async (channel, payload) => {
        published.push({ channel, payload });
      },
      quit: async () => {},
    },
  },
});

let ownerId: string;
let collaboratorId: string;
let noteId: string;

const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Priv Owner", email: `push-priv-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  const [collab] = await db
    .insert(user)
    .values({ name: "Priv Collab", email: `push-priv-collab-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner || !collab) throw new Error("user setup failed");
  ownerId = owner.id;
  collaboratorId = collab.id;
  const [created] = await db
    .insert(note)
    .values({ ownerId, access: "edit", shareToken: `push-priv-${crypto.randomUUID()}` })
    .returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;
  await db.insert(noteCollaborator).values({ noteId, userId: collaboratorId, status: "active" });
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, collaboratorId));
});

test("makePrivate via push reproduces the private route effect + post-commit revoke (goal #11-12)", async () => {
  const clientGroupID = crypto.randomUUID();

  const [before] = await db.select({ v: note.metaVersion }).from(note).where(eq(note.id, noteId));

  const res = await asUser(ownerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID,
        mutations: [{ seq: 1, name: "makePrivate", args: { id: noteId } }],
      }),
  );

  expect(res.status).toBe(200);
  expect(res.body.verdicts).toEqual([{ seq: 1, status: "applied" }]);

  const [row] = await db
    .select({ access: note.access, shareToken: note.shareToken, v: note.metaVersion })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.access).toBe("private");
  expect(row?.shareToken).toBeNull();
  expect(row?.v).toBe((before?.v ?? 0) + 1); // meta_version bumped

  const [collab] = await db
    .select({ status: noteCollaborator.status })
    .from(noteCollaborator)
    .where(eq(noteCollaborator.noteId, noteId));
  expect(collab?.status).toBe("revoked");

  // The revoke was published (after commit) on the note's revoke channel with the made_private reason.
  const revoke = published.find((p) => p.channel === revokeChannel(noteId));
  expect(revoke).toBeDefined();
  expect(JSON.parse(revoke?.payload ?? "{}")).toEqual({ reason: "made_private" });
}, 30_000);
