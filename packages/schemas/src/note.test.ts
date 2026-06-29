import { describe, expect, it } from "bun:test";
import {
  createNoteResponseSchema,
  noteMetadataSchema,
  noteSummarySchema,
  sharedNoteSummarySchema,
} from "./note";

const summary = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Untitled",
  preview: "",
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("noteSummarySchema", () => {
  it("accepts a metadata-only list row", () => {
    expect(noteSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects a row missing required fields", () => {
    expect(noteSummarySchema.safeParse({ id: "x", title: "t" }).success).toBe(false);
  });
});

describe("sharedNoteSummarySchema", () => {
  it("adds the access level to a summary", () => {
    const shared = { ...summary, access: "view" as const };
    expect(sharedNoteSummarySchema.parse(shared)).toEqual(shared);
  });

  it("rejects an unknown access level", () => {
    expect(sharedNoteSummarySchema.safeParse({ ...summary, access: "none" }).success).toBe(false);
  });
});

describe("noteMetadataSchema", () => {
  it("accepts get-one metadata with isOwner", () => {
    const meta = {
      id: summary.id,
      title: "Untitled",
      preview: "",
      access: "private" as const,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
      isOwner: true,
    };
    expect(noteMetadataSchema.parse(meta)).toEqual(meta);
  });

  it("treats isOwner as optional", () => {
    const meta = {
      id: summary.id,
      title: "Untitled",
      preview: "",
      access: "private" as const,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
    };
    expect(noteMetadataSchema.parse(meta).isOwner).toBeUndefined();
  });
});

describe("createNoteResponseSchema", () => {
  it("accepts the create payload (id/title/access/updatedAt only — no preview/createdAt)", () => {
    const created = {
      id: summary.id,
      title: "Untitled",
      access: "private" as const,
      updatedAt: "2026-06-29T00:00:00.000Z",
    };
    expect(createNoteResponseSchema.parse(created)).toEqual(created);
  });
});
