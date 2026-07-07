import { expect, test } from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import supertest from "supertest";
import { buildApp } from "../app";

/**
 * SSE endpoint status/headers (spec 17). Full pipe delivery is asserted in the client Vitest test with a
 * mocked EventSource — a never-ending stream would hang supertest — so here we only check auth + the SSE
 * response line, using a raw request we destroy as soon as the headers arrive.
 */

const app = buildApp({ skipAuth: true });

test("GET /api/sync/stream without a session → 401", async () => {
  const res = await supertest(app).get("/api/sync/stream");
  expect(res.status).toBe(401);
});

test("GET /api/sync/stream authed → 200 with text/event-stream headers", async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const head = await new Promise<{ status: number; contentType?: string }>((resolve, reject) => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/sync/stream", headers: { "x-test-user-id": "u1" } },
        (res) => {
          resolve({ status: res.statusCode ?? 0, contentType: res.headers["content-type"] });
          res.destroy(); // don't wait for the (never-ending) stream body
        },
      );
      req.on("error", reject);
    });
    expect(head.status).toBe(200);
    expect(head.contentType).toContain("text/event-stream");
  } finally {
    server.close();
  }
});
