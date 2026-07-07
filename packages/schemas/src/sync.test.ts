import { describe, expect, it } from "bun:test";
import {
  mutationNameSchema,
  mutationSchema,
  noteMetaSchema,
  pokeEventSchema,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
} from "./sync";

// A valid v4 UUID (as minted by crypto.randomUUID); z.uuid() enforces RFC version/variant bits.
const CGID = "11111111-1111-4111-8111-111111111111";

describe("noteMetaSchema", () => {
  it("accepts an authoritative note-meta row with label ids and metaVersion", () => {
    const meta = {
      id: "n1",
      title: "Untitled",
      preview: "",
      access: "private" as const,
      lifecycle: "active" as const,
      labelIds: ["l1", "l2"],
      updatedAt: "2026-07-07T00:00:00.000Z",
      metaVersion: 3,
    };
    expect(noteMetaSchema.parse(meta)).toEqual(meta);
  });

  it("rejects an off-palette access level", () => {
    const bad = {
      id: "n1",
      title: "t",
      preview: "",
      access: "none",
      lifecycle: "active",
      labelIds: [],
      updatedAt: "2026-07-07T00:00:00.000Z",
      metaVersion: 0,
    };
    expect(noteMetaSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown lifecycle", () => {
    const bad = {
      id: "n1",
      title: "t",
      preview: "",
      access: "private",
      lifecycle: "deleted",
      labelIds: [],
      updatedAt: "2026-07-07T00:00:00.000Z",
      metaVersion: 0,
    };
    expect(noteMetaSchema.safeParse(bad).success).toBe(false);
  });
});

describe("mutationNameSchema", () => {
  it("enumerates exactly the 14 canonical names", () => {
    expect(mutationNameSchema.options).toEqual([
      "createNote",
      "renameNote",
      "archiveNote",
      "unarchiveNote",
      "trashNote",
      "restoreNote",
      "permanentDeleteNote",
      "setShareLevel",
      "makePrivate",
      "createLabel",
      "renameLabel",
      "deleteLabel",
      "applyLabel",
      "removeLabel",
    ]);
  });
});

describe("mutationSchema", () => {
  it("rejects an unknown mutation name", () => {
    expect(mutationSchema.safeParse({ name: "frobnicate", args: {} }).success).toBe(false);
  });

  // One representative per arg-shape family.
  it("round-trips createNote (id + optional title)", () => {
    const m = { name: "createNote" as const, args: { id: "n1", title: "Hello" } };
    expect(mutationSchema.parse(m)).toEqual(m);
    // title is optional
    expect(mutationSchema.safeParse({ name: "createNote", args: { id: "n1" } }).success).toBe(true);
  });

  it("round-trips renameNote (id + title)", () => {
    const m = { name: "renameNote" as const, args: { id: "n1", title: "New" } };
    expect(mutationSchema.parse(m)).toEqual(m);
    expect(mutationSchema.safeParse({ name: "renameNote", args: { id: "n1" } }).success).toBe(
      false,
    );
  });

  it("round-trips an id-only lifecycle mutation (trashNote)", () => {
    const m = { name: "trashNote" as const, args: { id: "n1" } };
    expect(mutationSchema.parse(m)).toEqual(m);
  });

  it("round-trips setShareLevel (view|edit only, not private)", () => {
    const m = { name: "setShareLevel" as const, args: { id: "n1", level: "edit" as const } };
    expect(mutationSchema.parse(m)).toEqual(m);
    expect(
      mutationSchema.safeParse({ name: "setShareLevel", args: { id: "n1", level: "private" } })
        .success,
    ).toBe(false);
  });

  it("round-trips createLabel (id + name + palette color)", () => {
    const m = {
      name: "createLabel" as const,
      args: { id: "l1", name: "Work", color: "sky" as const },
    };
    expect(mutationSchema.parse(m)).toEqual(m);
    expect(
      mutationSchema.safeParse({
        name: "createLabel",
        args: { id: "l1", name: "Work", color: "fuchsia" },
      }).success,
    ).toBe(false);
  });

  it("round-trips applyLabel (noteId + labelId)", () => {
    const m = { name: "applyLabel" as const, args: { noteId: "n1", labelId: "l1" } };
    expect(mutationSchema.parse(m)).toEqual(m);
    expect(mutationSchema.safeParse({ name: "applyLabel", args: { noteId: "n1" } }).success).toBe(
      false,
    );
  });
});

describe("pushRequestSchema", () => {
  it("accepts a client-group id and a queue of seq/name/args envelopes", () => {
    const req = {
      clientGroupID: CGID,
      mutations: [
        { seq: 1, name: "createNote" as const, args: { id: "n1" } },
        { seq: 2, name: "renameNote" as const, args: { id: "n1", title: "Hi" } },
      ],
    };
    expect(pushRequestSchema.parse(req)).toEqual(req);
  });

  it("rejects a non-uuid clientGroupID", () => {
    expect(
      pushRequestSchema.safeParse({ clientGroupID: "not-a-uuid", mutations: [] }).success,
    ).toBe(false);
  });
});

describe("pushResponseSchema", () => {
  it("carries lastMutationID and per-mutation verdicts", () => {
    const res = {
      lastMutationID: 2,
      verdicts: [
        { seq: 1, status: "applied" as const },
        { seq: 2, status: "rejected" as const, reason: "forbidden" as const },
      ],
    };
    expect(pushResponseSchema.parse(res)).toEqual(res);
  });

  it("accepts the four permanent reject reasons (incl. not_found)", () => {
    for (const reason of ["forbidden", "invalid", "conflict", "not_found"] as const) {
      expect(
        pushResponseSchema.safeParse({
          lastMutationID: 1,
          verdicts: [{ seq: 1, status: "rejected", reason }],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown reject reason", () => {
    expect(
      pushResponseSchema.safeParse({
        lastMutationID: 1,
        verdicts: [{ seq: 1, status: "rejected", reason: "banana" }],
      }).success,
    ).toBe(false);
  });
});

describe("pullRequestSchema / pullResponseSchema", () => {
  it("accepts a pull request with a nullable cookie", () => {
    expect(pullRequestSchema.parse({ clientGroupID: CGID, cookie: null }).cookie).toBeNull();
    expect(pullRequestSchema.parse({ clientGroupID: CGID, cookie: "c1" }).cookie).toBe("c1");
  });

  it("carries puts (NoteMeta[]), dels (ids), lastMutationID and an opaque cookie", () => {
    const res = {
      puts: [
        {
          id: "n1",
          title: "t",
          preview: "",
          access: "private" as const,
          lifecycle: "active" as const,
          labelIds: [],
          updatedAt: "2026-07-07T00:00:00.000Z",
          metaVersion: 1,
        },
      ],
      dels: ["n2"],
      lastMutationID: 5,
      cookie: "c2",
    };
    expect(pullResponseSchema.parse(res)).toEqual(res);
  });

  it("carries the additive optional reset flag (full-resync signal), defaulting to absent", () => {
    const base = { puts: [], dels: [], lastMutationID: 0, cookie: "c1" };
    // A parser that ignores `reset` still validates (additive, no field renamed).
    expect(pullResponseSchema.parse(base).reset).toBeUndefined();
    expect(pullResponseSchema.parse({ ...base, reset: true }).reset).toBe(true);
    expect(pullResponseSchema.safeParse({ ...base, reset: "yes" }).success).toBe(false);
  });
});

describe("pokeEventSchema", () => {
  it("is a content-free poke nudge", () => {
    expect(pokeEventSchema.parse({ type: "poke" })).toEqual({ type: "poke" });
    expect(pokeEventSchema.safeParse({ type: "other" }).success).toBe(false);
  });
});
