import IORedis from "ioredis";

export function revokeChannel(noteId: string): string {
  return `revoke:${noteId}`;
}

export function roleChangeChannel(noteId: string): string {
  return `role-change:${noteId}`;
}

/**
 * Per-user "you have metadata changes — pull now" poke channel (spec 17, ADR-0005). Content-free by
 * design: publishers send a `"1"` sentinel and the SSE endpoint synthesizes the frame, so the browser
 * never parses channel data. Spec 19 publishes after a push (audience fanout); spec 17 delivers it.
 */
export function pokeUserChannel(userId: string): string {
  return `poke:user:${userId}`;
}

export interface RedisPublisher {
  publish(channel: string, payload: string): Promise<void>;
  quit(): Promise<void>;
}

/**
 * Publish a dataless poke to each user's channel (spec 17). De-dupes the audience so a user who both
 * owns and collaborates on the touched notes is poked once, and optional-chains the publisher so it is
 * a no-op when `REDIS_URL` is unset (dev/test), exactly like the other publish paths.
 */
export async function publishPokes(
  publisher: RedisPublisher | null,
  userIds: Iterable<string>,
): Promise<void> {
  for (const userId of new Set(userIds)) {
    await publisher?.publish(pokeUserChannel(userId), "1");
  }
}

/** A per-connection Redis subscriber for the SSE poke stream; `quit()` frees it on client disconnect. */
export interface PokeSubscriber {
  quit(): Promise<void>;
}

/**
 * One IORedis subscriber bound to a single user's poke channel (spec 17). Calls `onPoke` on each
 * message (the payload is ignored — the poke is dataless). Returns `null` when `REDIS_URL` is unset, so
 * the SSE endpoint still opens and heartbeats in dev/test; it just never receives pokes. A
 * subscribe-mode connection cannot also publish, so this is a dedicated client per stream.
 */
export function buildPokeSubscriber(userId: string, onPoke: () => void): PokeSubscriber | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new IORedis(url);
  client.subscribe(pokeUserChannel(userId), (err) => {
    if (err) console.error("[api] poke subscriber subscribe error:", err);
  });
  client.on("message", () => onPoke());
  return {
    quit: async () => {
      await client.quit();
    },
  };
}

/**
 * Build a raw IORedis publisher from `REDIS_URL`, or `null` when unset.
 * Used by `api` to broadcast revoke/role-change events to all socket instances.
 * A subscriber-mode connection cannot also publish, so this is a separate client.
 */
export function buildRedisPublisher(): RedisPublisher | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new IORedis(url);
  return {
    publish: async (channel, payload) => {
      await client.publish(channel, payload);
    },
    quit: async () => {
      await client.quit();
    },
  };
}
