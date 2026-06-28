import type { Hocuspocus } from "@hocuspocus/server";
import { revokeChannel, roleChangeChannel } from "@yapper/permissions";
import IORedis from "ioredis";
import type { ConnectionContext } from "./auth";

type KickReason = "note_made_private" | "role_change";

/**
 * Close all non-owner connections on a document. For `note_made_private`, sends a stateless kick
 * message first so the client can distinguish a permanent removal from a transient disconnect and
 * avoid reconnecting. For `role_change`, closes without a message — the client auto-reconnects and
 * `onAuthenticate` re-evaluates the new permission level.
 */
export function kickNonOwners(server: Hocuspocus, noteId: string, reason: KickReason): void {
  const doc = server.documents.get(noteId);
  if (!doc) return;
  for (const [connection] of doc.connections) {
    const ctx = connection.context as ConnectionContext;
    if (ctx.isOwner) continue;
    if (reason === "note_made_private") {
      connection.sendStateless(JSON.stringify({ type: "kick", reason: "note_made_private" }));
    }
    connection.webSocket.close();
  }
}

/**
 * Subscribe to `revoke:{noteId}` and `role-change:{noteId}` channels on Redis.
 * On each event, calls `kickNonOwners` so every socket instance disconnects the affected clients.
 * Returns the IORedis subscriber so the caller can quit it on shutdown.
 */
export function setupRevokeSubscriber(server: Hocuspocus, redisUrl: string): IORedis {
  const sub = new IORedis(redisUrl);

  sub.psubscribe(`${revokeChannel("*")}`, `${roleChangeChannel("*")}`, (err) => {
    if (err) console.error("[socket] revoke subscriber psubscribe error:", err);
  });

  sub.on("pmessage", (_pattern: string, channel: string, _message: string) => {
    const revokePrefix = "revoke:";
    const rolePrefix = "role-change:";
    if (channel.startsWith(revokePrefix)) {
      const noteId = channel.slice(revokePrefix.length);
      kickNonOwners(server, noteId, "note_made_private");
    } else if (channel.startsWith(rolePrefix)) {
      const noteId = channel.slice(rolePrefix.length);
      kickNonOwners(server, noteId, "role_change");
    }
  });

  return sub;
}
