import { expect, test } from "bun:test";
import { type AuthorizeDeps, authorizeConnection } from "./auth";

const OWNER = "11111111-1111-1111-1111-111111111111";
const NOTE = "22222222-2222-2222-2222-222222222222";

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    verifyToken: async () => ({ userId: OWNER }),
    loadNoteOwner: async () => OWNER,
    ...over,
  };
}

test("accepts the note owner holding a valid token", async () => {
  const ctx = await authorizeConnection({ token: "t", documentName: NOTE }, deps());
  expect(ctx.userId).toBe(OWNER);
});

test("rejects a verified user who does not own the note", async () => {
  await expect(
    authorizeConnection(
      { token: "t", documentName: NOTE },
      deps({ verifyToken: async () => ({ userId: "33333333-3333-3333-3333-333333333333" }) }),
    ),
  ).rejects.toThrow();
});

test("rejects a connection to a note that does not exist", async () => {
  await expect(
    authorizeConnection(
      { token: "t", documentName: NOTE },
      deps({ loadNoteOwner: async () => null }),
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
