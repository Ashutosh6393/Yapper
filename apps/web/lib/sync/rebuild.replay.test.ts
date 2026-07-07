// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { db, rebuild } from "./db";
// Importing the registry wires the 14 client-mutator bodies into rebuild()'s fold.
import "./mutators";

afterEach(async () => {
  await Promise.all([db.base.clear(), db.mutations.clear(), db.labels.clear(), db.notes.clear()]);
});

it("replays createNote+renameNote over an empty base, and rolling back reverts (goal #5)", async () => {
  const id = crypto.randomUUID();
  const createSeq = await db.mutations.add({ name: "createNote", args: { id } });
  const renameSeq = await db.mutations.add({ name: "renameNote", args: { id, title: "X" } });

  await rebuild();
  expect(await db.notes.get(id)).toMatchObject({ id, title: "X", lifecycle: "active" });

  // Drop the renameNote seq and re-fold → title reverts to the createNote default ("Untitled").
  await db.mutations.delete(renameSeq);
  await rebuild();
  expect((await db.notes.get(id))?.title).toBe("Untitled");

  // Drop the createNote seq → the note vanishes entirely.
  await db.mutations.delete(createSeq);
  await rebuild();
  expect(await db.notes.get(id)).toBeUndefined();
});
