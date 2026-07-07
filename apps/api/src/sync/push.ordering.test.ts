import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, label, note, noteLabel, user } from "@yapper/db";
import { and, eq } from "drizzle-orm";
import supertest from "supertest";
import { buildApp } from "../app";

const app = buildApp({ skipAuth: true });
let ownerId: string;

const asUser = (id: string) => (req: supertest.Test) => req.set("x-test-user-id", id);

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Order Owner", email: `push-order-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
});

test("applies a batch in ascending seq regardless of array order (goal #7)", async () => {
  const clientGroupID = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const labelId = crypto.randomUUID();

  // Array order deliberately scrambled; the handler must apply by seq (create before rename/apply).
  const res = await asUser(ownerId)(
    supertest(app)
      .post("/api/sync/push")
      .send({
        clientGroupID,
        mutations: [
          { seq: 4, name: "applyLabel", args: { noteId, labelId } },
          { seq: 2, name: "createNote", args: { id: noteId } },
          { seq: 1, name: "createLabel", args: { id: labelId, name: "Work", color: "sky" } },
          { seq: 3, name: "renameNote", args: { id: noteId, title: "X" } },
        ],
      }),
  );

  expect(res.status).toBe(200);
  expect(res.body.lastMutationID).toBe(4);
  expect(res.body.verdicts).toEqual([
    { seq: 1, status: "applied" },
    { seq: 2, status: "applied" },
    { seq: 3, status: "applied" },
    { seq: 4, status: "applied" },
  ]);

  const [row] = await db
    .select({ title: note.title, metaVersion: note.metaVersion })
    .from(note)
    .where(eq(note.id, noteId));
  expect(row?.title).toBe("X");
  // createNote v0 → renameNote +1 → applyLabel +1 = 2.
  expect(row?.metaVersion).toBe(2);

  const links = await db
    .select()
    .from(noteLabel)
    .where(and(eq(noteLabel.noteId, noteId), eq(noteLabel.labelId, labelId)));
  expect(links).toHaveLength(1);

  await db.delete(label).where(eq(label.id, labelId));
}, 30_000);
