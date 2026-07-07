import IORedis from "ioredis";

export function revokeChannel(noteId: string): string {
  return `revoke:${noteId}`;
}

export function roleChangeChannel(noteId: string): string {
  return `role-change:${noteId}`;
}

/**
 * Per-user "you have metadata changes — pull now" poke channel (spec 19 publishes after a push; the
 * SSE transport that delivers it is spec 17). Content-free by design (ADR-0005).
 */
export function pokeUserChannel(userId: string): string {
  return `poke:user:${userId}`;
}

export interface RedisPublisher {
  publish(channel: string, payload: string): Promise<void>;
  quit(): Promise<void>;
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
