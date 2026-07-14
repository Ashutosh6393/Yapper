import { describe, expect, it } from "vitest";
import { isChunkError } from "./is-chunk-error";

/**
 * The recovery button branches on this (spec 25c, ADR-007). Get it wrong and a stale-deploy tab is
 * offered a "Try again" that re-requests the same dead chunk forever.
 */
describe("isChunkError", () => {
  it("recognizes a webpack/Next ChunkLoadError by name", () => {
    const err = Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" });
    expect(isChunkError(err)).toBe(true);
  });

  it("recognizes a failed dynamic import by message (the note dialog's lazy Editor)", () => {
    expect(
      isChunkError(new TypeError("Failed to fetch dynamically imported module: /_next/x.js")),
    ).toBe(true);
  });

  it("does not mistake an ordinary render crash for a chunk failure", () => {
    expect(
      isChunkError(new TypeError("Cannot read properties of undefined (reading 'title')")),
    ).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });
});
