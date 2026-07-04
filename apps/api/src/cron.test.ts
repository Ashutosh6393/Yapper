import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, note, user } from "@yapper/db";
import { eq, sql } from "drizzle-orm";
import { purgeTrash } from "./cron";

let ownerId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Cron Owner", email: `cron-owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user setup failed");
  ownerId = owner.id;
}, 30_000);

afterAll(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
});

test("purgeTrash deletes notes trashed > 24h ago and leaves recent/active ones", async () => {
  // Old-trashed (25h ago) — should be purged.
  const [oldTrashed] = await db
    .insert(note)
    .values({ ownerId, trashedAt: sql`now() - interval '25 hours'` })
    .returning({ id: note.id });
  // Recently trashed (1h ago) — should survive.
  const [recentTrashed] = await db
    .insert(note)
    .values({ ownerId, trashedAt: sql`now() - interval '1 hour'` })
    .returning({ id: note.id });
  // Active (never trashed) — should survive.
  const [active] = await db.insert(note).values({ ownerId }).returning({ id: note.id });
  if (!oldTrashed || !recentTrashed || !active) throw new Error("note setup failed");

  const purged = await purgeTrash(db);
  expect(purged).toBeGreaterThanOrEqual(1);

  const survivors = await db.select({ id: note.id }).from(note).where(eq(note.ownerId, ownerId));
  const ids = survivors.map((r) => r.id);
  expect(ids).not.toContain(oldTrashed.id);
  expect(ids).toContain(recentTrashed.id);
  expect(ids).toContain(active.id);
});
