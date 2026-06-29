import { describe, expect, it } from "bun:test";
import { shareNoteBodySchema } from "./share";

describe("shareNoteBodySchema", () => {
  it("accepts a view or edit level", () => {
    expect(shareNoteBodySchema.parse({ level: "view" })).toEqual({ level: "view" });
    expect(shareNoteBodySchema.parse({ level: "edit" })).toEqual({ level: "edit" });
  });

  it("rejects 'private' and unknown levels (sharing only grants view/edit)", () => {
    expect(shareNoteBodySchema.safeParse({ level: "private" }).success).toBe(false);
    expect(shareNoteBodySchema.safeParse({ level: "owner" }).success).toBe(false);
  });

  it("rejects a missing level", () => {
    expect(shareNoteBodySchema.safeParse({}).success).toBe(false);
  });
});
