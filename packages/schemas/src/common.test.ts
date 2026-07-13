import { describe, expect, it } from "bun:test";
import { labelColorSchema, permissionSchema } from "./common";

describe("permissionSchema", () => {
  it("accepts the three effective permission levels", () => {
    expect(permissionSchema.parse("none")).toBe("none");
    expect(permissionSchema.parse("view")).toBe("view");
    expect(permissionSchema.parse("edit")).toBe("edit");
  });

  it("rejects an unknown permission", () => {
    expect(permissionSchema.safeParse("admin").success).toBe(false);
  });
});

describe("labelColorSchema", () => {
  it("accepts each palette key", () => {
    for (const c of ["slate", "rose", "amber", "emerald", "sky", "violet"] as const) {
      expect(labelColorSchema.parse(c)).toBe(c);
    }
  });

  it("rejects an off-palette color", () => {
    expect(labelColorSchema.safeParse("fuchsia").success).toBe(false);
    expect(labelColorSchema.safeParse("#ff0000").success).toBe(false);
  });
});
