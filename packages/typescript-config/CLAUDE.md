# packages/typescript-config

Shared TypeScript compiler configuration for the Yapper monorepo. Published as `@yapper/typescript-config`, it provides a strict `base.json` plus two environment-specific presets (`node.json`, `nextjs.json`) that every app and package extends via its local `tsconfig.json`. Centralizing these settings keeps strictness, module resolution, and target consistent across `web`, `api`, `socket`, and the shared packages.

## File Structure

- **base.json** (`display: "Base"`) — the common foundation all presets extend. Sets full strictness (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`), `target`/`lib` `ES2022`, `module: ESNext` with `moduleResolution: Bundler`, `moduleDetection: force`, plus `resolveJsonModule`, `esModuleInterop`, `isolatedModules`, and `skipLibCheck`.
- **node.json** (`display: "Node / Bun"`) — extends `base.json` for Bun/Node server and library code. Keeps `lib: ["ES2022"]` and sets `noEmit: true`.
- **nextjs.json** (`display: "Next.js"`) — extends `base.json` for the Next.js web app. Adds DOM libs (`["DOM", "DOM.Iterable", "ES2022"]`), `jsx: preserve`, `noEmit: true`, `incremental: true`, and the `next` TypeScript plugin.

## Exports

Package name: `@yapper/typescript-config`. The `files` field publishes the three configs; consumers extend them by path string:

- `@yapper/typescript-config/base.json`
- `@yapper/typescript-config/node.json`
- `@yapper/typescript-config/nextjs.json`

## When to Use

- **Bun/Node apps and shared packages** (`apps/api`, `apps/socket`, `packages/db`, `packages/auth`, `packages/permissions`, `packages/editor`) — extend `node.json`:

  ```json
  { "extends": "@yapper/typescript-config/node.json" }
  ```

- **The Next.js web app** (`apps/web`) — extend `nextjs.json`:

  ```json
  { "extends": "@yapper/typescript-config/nextjs.json" }
  ```

- **base.json** is the shared foundation and is not extended directly by consumers; extend `node.json` or `nextjs.json` instead.
