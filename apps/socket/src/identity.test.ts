import { expect, test } from "bun:test";
import { awarenessUserFor, colorFromUserId } from "./identity";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

test("colorFromUserId is deterministic — same user, same color everywhere", () => {
  expect(colorFromUserId(USER_A)).toBe(colorFromUserId(USER_A));
});

test("colorFromUserId varies only the hue, at a fixed OKLCH lightness/chroma", () => {
  // The caret's name flag is white text on this color, so every user's color must land at the same
  // perceptual lightness — a hue-only hash keeps that contrast constant.
  expect(colorFromUserId(USER_A)).toMatch(/^oklch\(0\.52 0\.15 \d+(\.\d+)?\)$/);
  expect(colorFromUserId(USER_A)).not.toBe(colorFromUserId(USER_B));
});

test("awarenessUserFor builds identity solely from the server-verified context", () => {
  const user = awarenessUserFor({ userId: USER_A, name: "Ada" });
  expect(user).toEqual({ id: USER_A, name: "Ada", color: colorFromUserId(USER_A) });
});
