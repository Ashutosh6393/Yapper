// fake-indexeddb backs the always-attached y-indexeddb persistence; test-scoped only.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { type ContentPersistence, ContentSync } from "./content-sync";

/** A mock persistence so the single-writer/handoff tests need no real IndexedDB timing. */
const mockPersistence = (): ContentPersistence => ({
  whenSynced: Promise.resolve(),
  destroy: vi.fn(),
});

/** Append a paragraph to the note's `default` fragment (a real CRDT update → triggers the flush). */
function edit(ydoc: Y.Doc, text: string): void {
  const fragment = ydoc.getXmlFragment("default");
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  fragment.insert(fragment.length, [p]);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ContentSync single-writer (goal #8)", () => {
  it("private access → a debounced REST flush and NO provider", async () => {
    vi.useFakeTimers();
    const createProvider = vi.fn(() => ({ destroy: vi.fn() }));
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider,
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "Hello");
    expect(flush).not.toHaveBeenCalled(); // trailing debounce
    await vi.advanceTimersByTimeAsync(100);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(createProvider).not.toHaveBeenCalled();
    expect(cs.provider).toBeNull();
    cs.destroy();
  });

  it("shared access → a provider and NO REST flush", async () => {
    vi.useFakeTimers();
    const provider = { destroy: vi.fn() };
    const createProvider = vi.fn(() => provider);
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider,
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("edit");
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(cs.provider).toBe(provider);

    edit(cs.ydoc, "Hello");
    await vi.advanceTimersByTimeAsync(200);
    expect(flush).not.toHaveBeenCalled(); // Hocuspocus owns persistence when shared
    cs.destroy();
  });
});

describe("ContentSync handoff preserves single-writer (goals #10, #11)", () => {
  it("private→public: the pending flush is cancelled and never fires once shared", async () => {
    vi.useFakeTimers();
    const provider = { destroy: vi.fn() };
    const createProvider = vi.fn(() => provider);
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider,
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "A"); // schedules a private flush
    cs.setAccess("view"); // handoff BEFORE the debounce fires
    expect(createProvider).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(flush).not.toHaveBeenCalled(); // cancelled by the handoff
    edit(cs.ydoc, "B");
    await vi.advanceTimersByTimeAsync(200);
    expect(flush).not.toHaveBeenCalled(); // shared → still never flushes
    cs.destroy();
  });

  it("public→private: the provider is torn down before REST resumes", async () => {
    vi.useFakeTimers();
    const provider = { destroy: vi.fn() };
    const createProvider = vi.fn(() => provider);
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider,
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("edit");
    cs.setAccess("private");
    expect(provider.destroy).toHaveBeenCalledTimes(1); // torn down first
    expect(cs.provider).toBeNull();

    edit(cs.ydoc, "resumed");
    await vi.advanceTimersByTimeAsync(100);
    expect(flush).toHaveBeenCalledTimes(1); // REST resumed
    cs.destroy();
  });
});

describe("ContentSync pull-after-flush (spec 23 — dashboard must see the new title)", () => {
  it("calls onFlushed after a successful private flush so the metadata lane can pull", async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const onFlushed = vi.fn();
    const cs = new ContentSync({
      noteId: "n1",
      createProvider: vi.fn(() => ({ destroy: vi.fn() })),
      flush,
      onFlushed,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "My Title");
    await vi.advanceTimersByTimeAsync(100);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(onFlushed).toHaveBeenCalledTimes(1);
    cs.destroy();
  });

  it("does NOT call onFlushed when the flush fails (nothing new landed server-side)", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("offline"));
    const onFlushed = vi.fn();
    const cs = new ContentSync({
      noteId: `off-${crypto.randomUUID()}`,
      createProvider: vi.fn(),
      flush,
      onFlushed,
      debounceMs: 10,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "x");
    await new Promise((r) => setTimeout(r, 40));

    expect(flush).toHaveBeenCalled();
    expect(onFlushed).not.toHaveBeenCalled();
    cs.destroy();
  });
});

describe("ContentSync flush-on-close (spec 23 — fast close must not drop the edit)", () => {
  it("destroy flushes a pending private edit so a fast close reaches the server", async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider: vi.fn(() => ({ destroy: vi.fn() })),
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "Quick note"); // schedules a flush 100ms out
    cs.destroy(); // close BEFORE the debounce fires

    expect(flush).toHaveBeenCalledTimes(1); // flushed on close, not dropped
  });

  it("destroy does NOT flush when nothing is pending (no redundant write)", async () => {
    vi.useFakeTimers();
    const flush = vi.fn().mockResolvedValue(undefined);
    const cs = new ContentSync({
      noteId: "n1",
      createProvider: vi.fn(() => ({ destroy: vi.fn() })),
      flush,
      createPersistence: mockPersistence,
      debounceMs: 100,
    });

    cs.setAccess("private");
    edit(cs.ydoc, "Saved");
    await vi.advanceTimersByTimeAsync(100); // debounce already flushed
    expect(flush).toHaveBeenCalledTimes(1);
    cs.destroy(); // nothing pending

    expect(flush).toHaveBeenCalledTimes(1); // no extra flush on close
  });
});

describe("ContentSync offline durability (goal #9)", () => {
  it("keeps the edit durable in y-indexeddb and does not throw when the flush fails", async () => {
    const noteId = `offline-${crypto.randomUUID()}`;
    const flush = vi.fn().mockRejectedValue(new Error("offline"));
    const cs = new ContentSync({ noteId, createProvider: vi.fn(), flush, debounceMs: 10 });
    await cs.whenLocalSynced;

    cs.setAccess("private");
    edit(cs.ydoc, "Durable text");
    await new Promise((r) => setTimeout(r, 40)); // let the debounce fire + flush reject (swallowed)
    expect(flush).toHaveBeenCalled();

    // Durable without any successful server write: a fresh doc restores the content from IndexedDB.
    const fresh = new Y.Doc();
    const restore = new IndexeddbPersistence(noteId, fresh);
    await restore.whenSynced;
    expect(fresh.getXmlFragment("default").toString()).toContain("Durable text");

    restore.destroy();
    cs.destroy();
  });
});
