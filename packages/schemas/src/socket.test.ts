import { describe, expect, it } from "bun:test";
import {
  type SocketServerMessage,
  socketHandshakeSchema,
  socketServerMessageSchema,
} from "./socket";

describe("socketHandshakeSchema", () => {
  it("accepts a non-empty token and documentName", () => {
    const parsed = socketHandshakeSchema.parse({ token: "jwt", documentName: "note-1" });
    expect(parsed).toEqual({ token: "jwt", documentName: "note-1" });
  });

  it("rejects an empty token or documentName", () => {
    expect(socketHandshakeSchema.safeParse({ token: "", documentName: "n" }).success).toBe(false);
    expect(socketHandshakeSchema.safeParse({ token: "t", documentName: "" }).success).toBe(false);
  });
});

describe("socketServerMessageSchema", () => {
  it("parses an identity message", () => {
    const msg: SocketServerMessage = {
      type: "identity",
      user: { id: "u1", name: "Ann", color: "hsl(1, 70%, 45%)" },
      permission: "edit",
    };
    expect(socketServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("parses a note_made_private kick message", () => {
    const msg: SocketServerMessage = { type: "kick", reason: "note_made_private" };
    expect(socketServerMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects an unknown message type", () => {
    expect(socketServerMessageSchema.safeParse({ type: "bogus" }).success).toBe(false);
  });
});
