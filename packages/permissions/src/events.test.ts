import { describe, expect, it } from "bun:test";
import { pokeUserChannel, publishPokes, type RedisPublisher } from "./events";

/** A capturing fake publisher — asserts channels/payloads without a live Redis (tests run Redis-free). */
function fakePublisher(): {
  publisher: RedisPublisher;
  sent: { channel: string; payload: string }[];
} {
  const sent: { channel: string; payload: string }[] = [];
  return {
    sent,
    publisher: {
      publish: async (channel, payload) => {
        sent.push({ channel, payload });
      },
      quit: async () => {},
    },
  };
}

describe("pokeUserChannel", () => {
  it("is the user-scoped poke channel", () => {
    expect(pokeUserChannel("u1")).toBe("poke:user:u1");
  });
});

describe("publishPokes", () => {
  it("publishes a dataless sentinel once per user, deduping repeats", async () => {
    const { publisher, sent } = fakePublisher();
    await publishPokes(publisher, ["a", "b", "a"]);
    expect(sent).toEqual([
      { channel: "poke:user:a", payload: "1" },
      { channel: "poke:user:b", payload: "1" },
    ]);
  });

  it("is a no-op when the publisher is null (REDIS_URL unset)", async () => {
    await expect(publishPokes(null, ["a", "b"])).resolves.toBeUndefined();
  });
});
