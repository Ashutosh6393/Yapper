import { afterEach, describe, expect, it } from "vitest";
import { isSyncEngineEnabled } from "./flag";

const original = process.env.NEXT_PUBLIC_SYNC_ENGINE;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = original;
});

describe("isSyncEngineEnabled", () => {
  it("is false when the flag is unset (default, incl. prod)", () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    expect(isSyncEngineEnabled()).toBe(false);
  });

  it('is false for any value other than "1"', () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "true";
    expect(isSyncEngineEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "0";
    expect(isSyncEngineEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "";
    expect(isSyncEngineEnabled()).toBe(false);
  });

  it('is true only when the flag is exactly "1"', () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    expect(isSyncEngineEnabled()).toBe(true);
  });
});
