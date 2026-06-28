import { buildRedisPublisher, type RedisPublisher } from "@yapper/permissions";

/**
 * Singleton Redis publisher for the api app. Null when REDIS_URL is unset (dev/test without Redis).
 * Used to notify socket instances of revoke and role-change events.
 */
export const redisPublisher: RedisPublisher | null = buildRedisPublisher();
