// fake-indexeddb backs the flag-on path; test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { SyncEngineProvider } from "./provider";

const original = process.env.NEXT_PUBLIC_SYNC_ENGINE;

// Only restore the env flag. Closing/deleting the Dexie db here would yank it out from under the
// provider's in-flight getClientGroupID() and surface a DatabaseClosedError. Tests run in definition
// order: the flag-off case sees a never-opened db; the flag-on case opens it and awaits completion.
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = original;
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
});
