import { expect, test } from "bun:test";
import { type AuthorizeDeps, authorizeConnection } from "./auth";
import { colorFromUserId } from "./identity";

const USER = "11111111-1111-1111-1111-111111111111";
const NOTE = "22222222-2222-2222-2222-222222222222";

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    verifyToken: async () => ({ userId: USER, name: "User" }),
    resolvePermission: async () => "edit",
    ...over,
  };
}

test("an editor is accepted with a read/write (not read-only) connection", async () => {
  const result = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(result.context.userId).toBe(USER);
  expect(result.context.permission).toBe("edit");
  expect(result.readOnly).toBe(false);
});

test("a viewer is accepted but marked read-only", async () => {
  const result = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({ resolvePermission: async () => "view" }),
  );
  expect(result.context.permission).toBe("view");
  expect(result.readOnly).toBe(true);
});

test("stamps server-authoritative identity (name + deterministic color) onto the context", async () => {
  const { context } = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(context.name).toBe("User");
  expect(context.color).toBe(colorFromUserId(USER));
});

test("a user with no permission is rejected", async () => {
  await expect(
    authorizeConnection(
      { token: "t", documentName: NOTE },
      deps({ resolvePermission: async () => "none" }),
    ),
  ).rejects.toThrow();
});

test("rejects when the token fails verification", async () => {
  await expect(
    authorizeConnection(
      { token: "bad", documentName: NOTE },
      deps({
        verifyToken: async () => {
          throw new Error("invalid token");
        },
      }),
    ),
  ).rejects.toThrow();
});
