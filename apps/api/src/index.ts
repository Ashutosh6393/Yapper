import { auth } from "@yapper/auth";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";

const app = express();
const PORT = Number(process.env.API_PORT ?? 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

app.use(cors({ origin: WEB_ORIGIN, credentials: true }));

// Better Auth owns everything under /api/auth/* (session, OAuth, JWKS, token).
// Mounted before express.json() so it can read the raw request body itself.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
