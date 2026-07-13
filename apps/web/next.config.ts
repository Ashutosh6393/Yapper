import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server output for the Docker image (apps/web/Dockerfile sets NEXT_OUTPUT).
  // Opt-in because tracing symlinks the workspace deps, which Windows blocks (EPERM) on a
  // plain local build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Trace workspace deps from the repo root, not apps/web, or the standalone bundle
  // misses the @yapper/* packages.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
};

export default nextConfig;
