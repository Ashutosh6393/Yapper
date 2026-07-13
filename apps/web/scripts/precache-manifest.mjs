/**
 * Post-build: list every static asset the app can lazily request, so the service worker's cache doesn't
 * depend on what a given online session happened to load (spec 24b).
 *
 * Next code-splits the editor into chunks the dashboard only fetches when a note is opened. With
 * cache-on-demand alone, a user who never opened a note while online has no editor chunk cached, and
 * going offline gives them a ChunkLoadError instead of an app. This walks the build output and writes
 * the full list to `public/precache.json`, which the client warms into the SW cache on load.
 *
 * Written to `public/` (not `.next/static/`) on purpose: `/_next/static/**` is served immutable and is
 * cache-first in the SW, which would pin the *manifest itself* to the first build forever.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(webRoot, ".next", "static");
const ASSET = /\.(js|css|woff2)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : ASSET.test(entry) ? [full] : [];
  });
}

const assets = walk(staticDir)
  .map((f) => `/_next/static/${relative(staticDir, f).split("\\").join("/")}`)
  .sort();

writeFileSync(join(webRoot, "public", "precache.json"), JSON.stringify(assets, null, 2));
console.log(`precache-manifest: ${assets.length} assets -> public/precache.json`);
