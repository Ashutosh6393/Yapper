import { buildPokeSubscriber } from "@yapper/permissions";
import { pokeEventSchema } from "@yapper/schemas";
import type { Request, Response } from "express";

/**
 * `GET /api/sync/stream` — the SSE poke transport (spec 17, ADR-0005). Holds one long-lived
 * `text/event-stream` per connection, subscribes a dedicated Redis subscriber to the caller's
 * `poke:user:{userId}` channel, and emits a dataless `event: poke` frame per message so the browser
 * runs `POST /api/sync/pull`. The Redis payload is ignored — the frame is synthesized server-side from
 * `pokeEventSchema`, so the browser never parses channel data. A 25s heartbeat comment keeps the pipe
 * open under proxy idle timeouts (ADR-17a). Redis-free (no `REDIS_URL`) still opens + heartbeats; it
 * just never pokes. Per-connection resources are freed on `req` close — no leaked subscriber or timer.
 */

/** Heartbeat cadence — below the ~30s proxy idle timeout we expect; a single tunable constant. */
const HEARTBEAT_MS = 25_000;

export function handleStream() {
  return (req: Request, res: Response, userId: string): Promise<void> =>
    // The promise stays pending for the life of the stream; resolving it (on close) lets Express finish.
    new Promise<void>((resolve) => {
      res.status(200).set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      res.flushHeaders();
      res.write(": connected\n\n"); // an initial comment kicks the stream open through buffering proxies

      const sub = buildPokeSubscriber(userId, () => {
        const event = pokeEventSchema.parse({ type: "poke", ts: Date.now() });
        res.write(`event: poke\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

      req.on("close", () => {
        clearInterval(heartbeat);
        void sub?.quit();
        resolve();
      });
    });
}
