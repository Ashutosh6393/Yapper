import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, noteCollaborator, user } from "@yapper/db";
import { pokeUserChannel } from "@yapper/permissions";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

/**
 * Goal-state (spec 17): a push that touches a note pokes the note's **affected audience** — owner +
 * active collaborators — and no one else. Publishes are captured via a mock `RedisPublisher` so the
 * test stays Redis-free (mirrors push.makeprivate.test.ts).
 */

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
let strangerId: string;
let noteId: string;

const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

beforeAll(async () => {
  const mk = async (name: string) => {
    const [row] = await db
      .insert(user)
      .values({ name, email: `push-poke-${name}-${crypto.randomUUID()}@example.com` })
      .returning();
    if (!row) throw new Error("user setup failed");
    return row.id;
  };
  ownerId = await mk("owner");
  collaboratorId = await mk("collab");
  strangerId = await mk("stranger");
  const [created] = await db
    .insert(note)
    .values({ ownerId, access: "edit", shareToken: `push-poke-${crypto.randomUUID()}` })
    .returning();
  if (!created) throw new Error("note setup failed");
  noteId = created.id;
  await db.insert(noteCollaborator).values({ noteId, userId: collaboratorId, status: "active" });
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, collaboratorId));
  await db.delete(user).where(eq(user.id, strangerId));
});

test("a push touching a shared note pokes owner + active collaborator, not an unrelated user (goal #6)", async () => {
  published.length = 0;
  const res = await asUser(ownerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID: crypto.randomUUID(),
        mutations: [{ seq: 1, name: "renameNote", args: { id: noteId, title: "Renamed" } }],
      }),
  );

  expect(res.status).toBe(200);
  expect(res.body.verdicts).toEqual([{ seq: 1, status: "applied" }]);

  const pokedChannels = published
    .filter((p) => p.channel.startsWith("poke:user:"))
    .map((p) => p.channel);
  expect(pokedChannels).toContain(pokeUserChannel(ownerId));
  expect(pokedChannels).toContain(pokeUserChannel(collaboratorId));
  expect(pokedChannels).not.toContain(pokeUserChannel(strangerId));
  // Content-free sentinel, one per audience member (deduped).
  expect(published.find((p) => p.channel === pokeUserChannel(ownerId))?.payload).toBe("1");
  expect(new Set(pokedChannels).size).toBe(pokedChannels.length);
}, 30_000);
