// fake-indexeddb backs the flag-on path; test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbModule from "./db";
import { db } from "./db";
import { SyncEngineProvider } from "./provider";
import * as pullModule from "./pull";

const original = process.env.NEXT_PUBLIC_SYNC_ENGINE;

// Only restore the env flag. Closing/deleting the Dexie db here would yank it out from under the
// provider's in-flight getClientGroupID() and surface a DatabaseClosedError. Tests run in definition
// order: the flag-off case sees a never-opened db; the flag-on case opens it and awaits completion.
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = original;
  vi.restoreAllMocks();
});

describe("SyncEngineProvider", () => {
  it("is a transparent pass-through when the flag is off (renders children, no Dexie open)", () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    render(
      <SyncEngineProvider>
        <div>child</div>
      </SyncEngineProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(db.isOpen()).toBe(false);
  });

  it("opens yapper-sync and resolves clientGroupID when the flag is on", async () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    render(
      <SyncEngineProvider>
        <div>child</div>
      </SyncEngineProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    await waitFor(() => expect(db.isOpen()).toBe(true));
    await waitFor(async () => {
      expect((await db.sync.get("clientGroupID"))?.value).toBeTruthy();
    });
  });

  it("bootstraps once in order: clientGroupID → pull → rebuild (flag on)", async () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    const cgid = vi.spyOn(dbModule, "getClientGroupID");
    const pull = vi.spyOn(pullModule, "pull").mockResolvedValue();
    const rebuild = vi.spyOn(dbModule, "rebuild").mockResolvedValue();

    render(
      <SyncEngineProvider>
        <div>child</div>
      </SyncEngineProvider>,
    );

    await waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1));
    expect(cgid).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(1);
    // Ordering: identity first, then fill db.base, then materialize db.notes.
    const [cgidOrder] = cgid.mock.invocationCallOrder;
    const [pullOrder] = pull.mock.invocationCallOrder;
    const [rebuildOrder] = rebuild.mock.invocationCallOrder;
    expect(cgidOrder ?? 0).toBeLessThan(pullOrder ?? 0);
    expect(pullOrder ?? 0).toBeLessThan(rebuildOrder ?? 0);
  });
});
