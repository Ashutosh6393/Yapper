import { expect, test } from "bun:test";
import { type AuthorizeDeps, authorizeConnection } from "./auth";
import { colorFromUserId } from "./identity";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "33333333-3333-3333-3333-333333333333";
const NOTE = "22222222-2222-2222-2222-222222222222";

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    verifyToken: async () => ({ userId: USER, name: "User" }),
    resolvePermission: async () => "edit",
    loadNote: async () => ({ ownerId: USER }),
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

test("rejects a malformed handshake (empty token) before verifying", async () => {
  await expect(authorizeConnection({ token: "", documentName: NOTE }, deps())).rejects.toThrow();
});

test("rejects a malformed handshake (empty documentName) before verifying", async () => {
  await expect(authorizeConnection({ token: "t", documentName: "" }, deps())).rejects.toThrow();
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

test("sets isOwner=true when the verified userId matches the note ownerId", async () => {
  const { context } = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(context.isOwner).toBe(true);
});

test("sets isOwner=false for a non-owner collaborator", async () => {
  const { context } = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({
      verifyToken: async () => ({ userId: OTHER, name: "Other" }),
      resolvePermission: async () => "view",
      loadNote: async () => ({ ownerId: USER }),
    }),
  );
  expect(context.isOwner).toBe(false);
});

test("sets isOwner=false when the note cannot be loaded", async () => {
  const { context } = await authorizeConnection(
    { token: "t", documentName: NOTE },
    deps({ loadNote: async () => null }),
  );
  expect(context.isOwner).toBe(false);
});
