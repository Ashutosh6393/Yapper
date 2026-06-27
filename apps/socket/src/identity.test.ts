import { expect, test } from "bun:test";
import { awarenessUserFor, colorFromUserId } from "./identity";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

test("colorFromUserId is deterministic — same user, same color everywhere", () => {
  expect(colorFromUserId(USER_A)).toBe(colorFromUserId(USER_A));
});

test("colorFromUserId returns an HSL string and distinguishes different users", () => {
  const color = colorFromUserId(USER_A);
  expect(color).toMatch(/^hsl\(\d+(\.\d+)?, \d+%, \d+%\)$/);
  expect(colorFromUserId(USER_A)).not.toBe(colorFromUserId(USER_B));
});

test("awarenessUserFor builds identity solely from the server-verified context", () => {
  const user = awarenessUserFor({ userId: USER_A, name: "Ada" });
  expect(user).toEqual({ id: USER_A, name: "Ada", color: colorFromUserId(USER_A) });
});
