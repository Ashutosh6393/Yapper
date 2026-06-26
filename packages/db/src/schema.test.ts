import { afterAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { note, user } from "./schema";

test("note round-trips: insert → select by id → defaults applied", async () => {
  // note.owner_id now FK-references user.id (slice 02), so the owner must exist first.
  const [owner] = await db
    .insert(user)
    .values({ name: "Test Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user insert returned no row");

  const [inserted] = await db.insert(note).values({ ownerId: owner.id }).returning();
  if (!inserted) throw new Error("note insert returned no row");

  try {
    expect(inserted.title).toBe("Untitled");
    expect(inserted.preview).toBe("");
    expect(inserted.access).toBe("private");
    expect(inserted.shareToken).toBeNull();
    expect(inserted.createdAt).toBeInstanceOf(Date);

    const found = await db.query.note.findFirst({ where: eq(note.id, inserted.id) });
    expect(found?.id).toBe(inserted.id);
    expect(found?.ownerId).toBe(owner.id);
  } finally {
    // Deleting the owner cascades to the note (ON DELETE CASCADE).
    await db.delete(user).where(eq(user.id, owner.id));
  }
}, 30_000); // generous timeout: Neon serverless can cold-start on the first query

afterAll(async () => {
  await pool.end();
});
