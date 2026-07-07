import { mutationNameSchema } from "@yapper/schemas";
import { describe, expect, it } from "vitest";
import { ACTION_PHRASE, rejectToastCopy } from "./reject-copy";

describe("rejectToastCopy", () => {
  it("gives access-specific copy for a forbidden reject", () => {
    expect(rejectToastCopy("renameNote", "forbidden")).toBe(
      "You no longer have access to this note.",
    );
  });

  it("gives existence-specific copy for a not_found reject", () => {
    expect(rejectToastCopy("trashNote", "not_found")).toBe("That note no longer exists.");
  });

  it("falls through to the generic action copy for invalid / conflict", () => {
    expect(rejectToastCopy("archiveNote", "conflict")).toBe("Couldn't archive the note.");
    expect(rejectToastCopy("renameLabel", "invalid")).toBe("Couldn't rename the label.");
  });

  it("has an ACTION_PHRASE entry for every canonical mutation name (completeness)", () => {
    for (const name of mutationNameSchema.options) {
      expect(ACTION_PHRASE[name]).toBeTruthy();
      // The generic copy is always well-formed for the invalid/conflict path.
      expect(rejectToastCopy(name, "invalid")).toBe(`Couldn't ${ACTION_PHRASE[name]}.`);
    }
  });
});
