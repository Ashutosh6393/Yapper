import { z } from "zod";
import { permissionSchema } from "./common";

/**
 * Hocuspocus handshake params the socket authorizes on connect. Both fields must be present;
 * the socket rejects the connection otherwise (before JWT verification).
 */
export const socketHandshakeSchema = z.object({
  token: z.string().min(1),
  documentName: z.string().min(1),
});
export type SocketHandshake = z.infer<typeof socketHandshakeSchema>;

/** Awareness identity the server stamps from the verified JWT (anti-spoof) and renders as a caret. */
export const awarenessUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});
export type AwarenessUser = z.infer<typeof awarenessUserSchema>;

/** Stateless message: server tells the client its server-authoritative identity + permission. */
export const socketIdentityMessageSchema = z.object({
  type: z.literal("identity"),
  user: awarenessUserSchema,
  permission: permissionSchema,
});

/** Stateless message: owner made the note private — client shows the banner and does not reconnect. */
export const socketKickMessageSchema = z.object({
  type: z.literal("kick"),
  reason: z.literal("note_made_private"),
});

/** Every server→client stateless message, discriminated by `type`. */
export const socketServerMessageSchema = z.discriminatedUnion("type", [
  socketIdentityMessageSchema,
  socketKickMessageSchema,
]);
export type SocketServerMessage = z.infer<typeof socketServerMessageSchema>;
