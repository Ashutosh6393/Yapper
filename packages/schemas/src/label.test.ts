import { describe, expect, it } from "bun:test";
import { createLabelBodySchema, labelSchema, setNoteLabelsBodySchema } from "./label";

describe("labelSchema", () => {
  it("accepts a sidebar label with a note count", () => {
    const label = { id: "l1", name: "Work", color: "sky" as const, noteCount: 3 };
    expect(labelSchema.parse(label)).toEqual(label);
  });

  it("rejects an off-palette color", () => {
    expect(
      labelSchema.safeParse({ id: "l1", name: "Work", color: "fuchsia", noteCount: 0 }).success,
    ).toBe(false);
  });
});

describe("createLabelBodySchema", () => {
  it("accepts a name and palette color", () => {
    expect(createLabelBodySchema.parse({ name: "Work", color: "amber" })).toEqual({
      name: "Work",
      color: "amber",
    });
  });

  it("rejects an empty name", () => {
    expect(createLabelBodySchema.safeParse({ name: "", color: "amber" }).success).toBe(false);
  });

  it("rejects a name over 50 chars", () => {
    expect(createLabelBodySchema.safeParse({ name: "x".repeat(51), color: "amber" }).success).toBe(
      false,
    );
  });
});

describe("setNoteLabelsBodySchema", () => {
  it("accepts a list of label ids (including empty)", () => {
    expect(setNoteLabelsBodySchema.parse({ labelIds: [] }).labelIds).toEqual([]);
    expect(setNoteLabelsBodySchema.parse({ labelIds: ["a", "b"] }).labelIds).toEqual(["a", "b"]);
  });

  it("rejects a missing labelIds field", () => {
    expect(setNoteLabelsBodySchema.safeParse({}).success).toBe(false);
  });
});
