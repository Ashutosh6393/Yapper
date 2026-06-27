import { Redis } from "@hocuspocus/extension-redis";
import IORedis from "ioredis";

/**
 * Redis channel/key namespace. All Hocuspocus pub/sub keys are prefixed with this, so multiple
 * socket instances sharing one Redis fan out document updates + awareness to each other. Slice 07's
 * revoke broadcast reuses the same bus under this prefix — keep the convention stable.
 */
export const REDIS_PREFIX = "yapper";

/**
 * Build the `@hocuspocus/extension-redis` extension from `REDIS_URL`, or `null` when it is unset so
 * single-instance dev and tests run without Redis. With two+ instances pointed at the same Redis,
 * clients on different instances stay in sync (cross-instance fanout — ADR-001).
 */
export function buildRedisExtension(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // `createClient` so the extension gets independent pub + sub connections (a subscriber-mode
  // connection can't also publish), rather than sharing one instance.
  return new Redis({ createClient: () => new IORedis(url), prefix: REDIS_PREFIX });
}
