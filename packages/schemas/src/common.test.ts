import { describe, expect, it } from "bun:test";
import { permissionSchema } from "./common";

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
