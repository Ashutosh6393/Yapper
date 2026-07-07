// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { db, getClientGroupID, rebuild } from "./db";

afterEach(async () => {
  // Reset the client-group identity between tests so idempotence checks start clean.
  await db.sync.clear();
});

describe("yapper-sync Dexie schema", () => {
  it("is named yapper-sync with the five canonical tables", () => {
    expect(db.name).toBe("yapper-sync");
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(["base", "labels", "mutations", "notes", "sync"]);
  });

  it("keys base/notes/labels by id, sync by key, and auto-increments mutations.seq", () => {
    expect(db.table("base").schema.primKey.keyPath).toBe("id");
    expect(db.table("notes").schema.primKey.keyPath).toBe("id");
    expect(db.table("labels").schema.primKey.keyPath).toBe("id");
    expect(db.table("sync").schema.primKey.keyPath).toBe("key");
    const mutations = db.table("mutations").schema;
    expect(mutations.primKey.keyPath).toBe("seq");
    expect(mutations.primKey.auto).toBe(true);
    expect(mutations.indexes.map((i) => i.keyPath)).toContain("id");
  });
});

describe("getClientGroupID", () => {
  it("mints a uuid once and returns the same id on every subsequent call", async () => {
    const first = await getClientGroupID();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const second = await getClientGroupID();
    expect(second).toBe(first);
    // Persisted in db.sync under the "clientGroupID" key.
    expect((await db.sync.get("clientGroupID"))?.value).toBe(first);
  });
});

describe("rebuild (seam — implemented by spec 15)", () => {
  it("is an exported async function that throws not-implemented", async () => {
    expect(typeof rebuild).toBe("function");
    await expect(rebuild()).rejects.toThrow(/not implemented/i);
  });
});
