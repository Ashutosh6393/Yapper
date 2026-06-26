import { afterAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { note } from "./schema";

// A throwaway owner id; the FK to user.id is not enforced until slice 02.
const OWNER_ID = "00000000-0000-0000-0000-0000000000a1";

test("note round-trips: insert → select by id → defaults applied", async () => {
  const [inserted] = await db.insert(note).values({ ownerId: OWNER_ID }).returning();
  if (!inserted) throw new Error("insert returned no row");

  try {
    expect(inserted.title).toBe("Untitled");
    expect(inserted.preview).toBe("");
    expect(inserted.access).toBe("private");
    expect(inserted.shareToken).toBeNull();
    expect(inserted.createdAt).toBeInstanceOf(Date);

    const found = await db.query.note.findFirst({ where: eq(note.id, inserted.id) });
    expect(found?.id).toBe(inserted.id);
    expect(found?.ownerId).toBe(OWNER_ID);
  } finally {
    await db.delete(note).where(eq(note.id, inserted.id));
  }
}, 30_000); // generous timeout: Neon serverless can cold-start on the first query

afterAll(async () => {
  await pool.end();
});
