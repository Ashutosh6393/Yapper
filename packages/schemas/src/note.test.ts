import { describe, expect, it } from "bun:test";
import {
  createNoteArgsSchema,
  createNoteResponseSchema,
  labelChipSchema,
  noteListQuerySchema,
  noteMetadataSchema,
  noteSummarySchema,
  putNoteContentBodySchema,
  sharedNoteSummarySchema,
} from "./note";

const summary = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Untitled",
  preview: "",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
  labels: [],
};

describe("labelChipSchema", () => {
  it("accepts a chip with a palette color", () => {
    const chip = { id: "l1", name: "Work", color: "sky" as const };
    expect(labelChipSchema.parse(chip)).toEqual(chip);
  });

  it("rejects a chip with an off-palette color", () => {
    expect(labelChipSchema.safeParse({ id: "l1", name: "Work", color: "fuchsia" }).success).toBe(
      false,
    );
  });
});

describe("noteSummarySchema", () => {
  it("accepts a metadata-only list row with access and labels", () => {
    const withLabel = { ...summary, labels: [{ id: "l1", name: "Work", color: "sky" as const }] };
    expect(noteSummarySchema.parse(withLabel)).toEqual(withLabel);
  });

  it("defaults labels to an empty array when omitted", () => {
    const { labels, ...noLabels } = summary;
    expect(noteSummarySchema.parse(noLabels).labels).toEqual([]);
  });

  it("rejects a row missing access", () => {
    const { access, ...noAccess } = summary;
    expect(noteSummarySchema.safeParse(noAccess).success).toBe(false);
  });

  it("rejects a row missing required fields", () => {
    expect(noteSummarySchema.safeParse({ id: "x", title: "t" }).success).toBe(false);
  });
});

describe("noteListQuerySchema", () => {
  it("defaults filter to active with no params", () => {
    expect(noteListQuerySchema.parse({})).toEqual({ filter: "active" });
  });

  it("accepts a filter and label", () => {
    expect(noteListQuerySchema.parse({ filter: "trashed", label: "l1" })).toEqual({
      filter: "trashed",
      label: "l1",
    });
  });

  it("rejects an unknown filter", () => {
    expect(noteListQuerySchema.safeParse({ filter: "all" }).success).toBe(false);
  });
});

describe("sharedNoteSummarySchema", () => {
  it("adds the owner name to a summary", () => {
    const shared = { ...summary, access: "view" as const, ownerName: "Jess Park" };
    expect(sharedNoteSummarySchema.parse(shared)).toEqual(shared);
  });

  it("rejects a shared row missing ownerName", () => {
    expect(sharedNoteSummarySchema.safeParse({ ...summary, access: "view" }).success).toBe(false);
  });

  it("rejects an unknown access level", () => {
    expect(
      sharedNoteSummarySchema.safeParse({ ...summary, access: "none", ownerName: "x" }).success,
    ).toBe(false);
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

describe("createNoteArgsSchema", () => {
  it("parses a well-formed client-minted uuid", () => {
    const args = { id: "11111111-1111-4111-8111-111111111111" };
    expect(createNoteArgsSchema.parse(args)).toEqual(args);
  });

  it("rejects a non-uuid id", () => {
    expect(createNoteArgsSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(createNoteArgsSchema.safeParse({}).success).toBe(false);
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

describe("putNoteContentBodySchema", () => {
  it("accepts a base64 Yjs state string", () => {
    const body = { state: "AAECAwQF" };
    expect(putNoteContentBodySchema.parse(body)).toEqual(body);
  });

  it("rejects a non-base64 state and a missing state", () => {
    expect(putNoteContentBodySchema.safeParse({ state: "not base64!!" }).success).toBe(false);
    expect(putNoteContentBodySchema.safeParse({}).success).toBe(false);
  });
});
