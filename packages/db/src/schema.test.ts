import { afterAll, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "./client";
import { label, note, noteLabel, syncClient, user } from "./schema";

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

test("note lifecycle timestamps default to null and are settable", async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Lifecycle Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user insert returned no row");

  try {
    const [n] = await db.insert(note).values({ ownerId: owner.id }).returning();
    if (!n) throw new Error("note insert returned no row");

    // New nullable lifecycle columns default to null (active state).
    expect(n.archivedAt).toBeNull();
    expect(n.trashedAt).toBeNull();

    const now = new Date();
    const [trashed] = await db
      .update(note)
      .set({ trashedAt: now })
      .where(eq(note.id, n.id))
      .returning();
    expect(trashed?.trashedAt).toBeInstanceOf(Date);
  } finally {
    await db.delete(user).where(eq(user.id, owner.id));
  }
}, 30_000);

test("label + note_label: create, attach, unique name per owner, cascade", async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Label Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user insert returned no row");

  try {
    const [lbl] = await db
      .insert(label)
      .values({ ownerId: owner.id, name: "Work", color: "sky" })
      .returning();
    if (!lbl) throw new Error("label insert returned no row");
    expect(lbl.color).toBe("sky");
    expect(lbl.createdAt).toBeInstanceOf(Date);

    // color defaults to "slate" when omitted.
    const [dflt] = await db
      .insert(label)
      .values({ ownerId: owner.id, name: "Personal" })
      .returning();
    expect(dflt?.color).toBe("slate");

    // Unique (ownerId, name): a duplicate name for the same owner is rejected.
    let duplicateRejected = false;
    try {
      await db.insert(label).values({ ownerId: owner.id, name: "Work", color: "rose" });
    } catch {
      duplicateRejected = true;
    }
    expect(duplicateRejected).toBe(true);

    const [n] = await db.insert(note).values({ ownerId: owner.id }).returning();
    if (!n) throw new Error("note insert returned no row");

    await db.insert(noteLabel).values({ noteId: n.id, labelId: lbl.id });
    const links = await db
      .select()
      .from(noteLabel)
      .where(and(eq(noteLabel.noteId, n.id), eq(noteLabel.labelId, lbl.id)));
    expect(links).toHaveLength(1);

    // Deleting the label cascades to note_label.
    await db.delete(label).where(eq(label.id, lbl.id));
    const afterLabelDelete = await db.select().from(noteLabel).where(eq(noteLabel.noteId, n.id));
    expect(afterLabelDelete).toHaveLength(0);
  } finally {
    await db.delete(user).where(eq(user.id, owner.id));
  }
}, 30_000);

test("note.meta_version defaults to 0 and is bump-able (spec 19)", async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Meta Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user insert returned no row");

  try {
    const [n] = await db.insert(note).values({ ownerId: owner.id }).returning();
    if (!n) throw new Error("note insert returned no row");
    expect(n.metaVersion).toBe(0);

    const [bumped] = await db
      .update(note)
      .set({ metaVersion: sql`${note.metaVersion} + 1` })
      .where(eq(note.id, n.id))
      .returning();
    expect(bumped?.metaVersion).toBe(1);
  } finally {
    await db.delete(user).where(eq(user.id, owner.id));
  }
}, 30_000);

test("sync_client round-trips: pk client_group_id, last_mutation_id defaults to 0 (spec 19)", async () => {
  const [owner] = await db
    .insert(user)
    .values({ name: "Sync Owner", email: `owner-${crypto.randomUUID()}@example.com` })
    .returning();
  if (!owner) throw new Error("user insert returned no row");
  const groupId = crypto.randomUUID();

  try {
    const [row] = await db
      .insert(syncClient)
      .values({ clientGroupId: groupId, userId: owner.id })
      .returning();
    expect(row?.lastMutationId).toBe(0);
    expect(row?.clientGroupId).toBe(groupId);

    const [advanced] = await db
      .update(syncClient)
      .set({ lastMutationId: 5 })
      .where(eq(syncClient.clientGroupId, groupId))
      .returning();
    expect(advanced?.lastMutationId).toBe(5);
  } finally {
    // sync_client.user_id cascades on user delete.
    await db.delete(user).where(eq(user.id, owner.id));
  }
}, 30_000);

afterAll(async () => {
  await pool.end();
});
