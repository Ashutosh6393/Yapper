import { render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../lib/sync/db";
import { Providers } from "./providers";

const original = process.env.NEXT_PUBLIC_SYNC_ENGINE;

// next-themes' ThemeProvider reads window.matchMedia, which jsdom doesn't implement. Shim it so the
// real provider tree renders (this test exercises the full Providers composition).
beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = original;
});

describe("Providers — flag-off parity", () => {
  it("renders the app tree and leaves the sync engine inert when the flag is unset", () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    render(
      <Providers>
        <div>dashboard</div>
      </Providers>,
    );
    // The app renders exactly as today: children mount through the existing provider tree...
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    // ...and the sync engine never touches IndexedDB (SyncEngineProvider is a pass-through).
    expect(db.isOpen()).toBe(false);
  });
});
