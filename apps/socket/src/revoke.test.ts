import { expect, test } from "bun:test";
import type { Hocuspocus } from "@hocuspocus/server";
import type { ConnectionContext } from "./auth";
import { kickNonOwners } from "./revoke";

const OWNER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COLLAB_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOTE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeContext(userId: string, isOwner: boolean): ConnectionContext {
  return { userId, name: "User", color: "#000", permission: "edit", isOwner };
}

type FakeConn = {
  context: ConnectionContext;
  statelessSent: string[];
  closed: boolean;
  sendStateless(payload: string): void;
  webSocket: { close(): void };
};

function makeConn(ctx: ConnectionContext): FakeConn {
  const conn: FakeConn = {
    context: ctx,
    statelessSent: [],
    closed: false,
    sendStateless(payload) {
      this.statelessSent.push(payload);
    },
    webSocket: {
      close() {
        conn.closed = true;
      },
    },
  };
  return conn;
}

function makeServer(conns: FakeConn[]): Hocuspocus {
  const connMap = new Map(conns.map((c) => [c, {}]));
  const doc = { connections: connMap };
  const documents = new Map([[NOTE_ID, doc]]);
  return { documents } as unknown as Hocuspocus;
}

test("kickNonOwners closes collaborator connections with note_made_private stateless message", () => {
  const owner = makeConn(makeContext(OWNER_ID, true));
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([owner, collab]);

  kickNonOwners(server, NOTE_ID, "note_made_private");

  expect(owner.closed).toBe(false);
  expect(owner.statelessSent).toHaveLength(0);
  expect(collab.closed).toBe(true);
  expect(collab.statelessSent).toHaveLength(1);
  expect(JSON.parse(collab.statelessSent[0]!)).toEqual({
    type: "kick",
    reason: "note_made_private",
  });
});

test("kickNonOwners for role_change closes non-owner connections (no stateless message — auto-reconnect)", () => {
  const owner = makeConn(makeContext(OWNER_ID, true));
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([owner, collab]);

  kickNonOwners(server, NOTE_ID, "role_change");

  expect(owner.closed).toBe(false);
  expect(collab.closed).toBe(true);
  expect(collab.statelessSent).toHaveLength(0);
});

test("kickNonOwners is a no-op when the document has no connections on this instance", () => {
  const server = makeServer([]);
  expect(() => kickNonOwners(server, NOTE_ID, "note_made_private")).not.toThrow();
});

test("kickNonOwners is a no-op for an unknown noteId", () => {
  const collab = makeConn(makeContext(COLLAB_ID, false));
  const server = makeServer([collab]);
  expect(() => kickNonOwners(server, "unknown-note", "note_made_private")).not.toThrow();
  expect(collab.closed).toBe(false);
});
