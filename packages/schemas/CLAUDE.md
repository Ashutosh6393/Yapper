# packages/schemas

> **Status: planned — scaffolded in `specs/09-frontend-stack` slice 09a, populated in 09b.** This doc describes the package's intended shape and contract. The directory and files below do not all exist yet; treat this as the spec for the package and check `specs/09-frontend-stack/implementation.md` for what's actually built.

`@yapper/schemas` is the single source of truth for **cross-boundary data validation** in Yapper. It holds [Zod](https://zod.dev) schemas (and the TypeScript types inferred from them via `z.infer`) for every shape that crosses a trust boundary: REST request/response bodies between `web` and `api`, and the WebSocket handshake/message payloads between `web` and `socket`. All three apps import from this package instead of redefining shapes, so the client and server can never silently disagree about a contract.

## Tech Stack

- **Zod** — schema definition + runtime parsing.
- **TypeScript `5.9.2`**, strict (extends `@yapper/typescript-config/node.json`).
- Pure, dependency-light: **no** DB, network, React, or Node-runtime imports — safe to import from `web` (browser), `api`, and `socket` alike.
- **Biome** for lint/format (repo-root config).

## File Structure

```
packages/schemas/
├── src/
│   ├── index.ts          # Barrel: re-exports every schema + inferred type
│   ├── note.ts           # Note metadata, create/list/get request + response schemas
│   ├── share.ts          # Share/join request + response schemas, access-level enum (private|view|edit)
│   ├── socket.ts         # Handshake/auth context + client→server / server→client message schemas
│   │                     #   (identity, permission, kick { reason: "note_made_private" })
│   └── common.ts         # Shared primitives (ids, permission enum none|view|edit, timestamps)
├── tsconfig.json         # extends @yapper/typescript-config/node.json
└── package.json          # name: @yapper/schemas; exports "." (+ subpaths if needed); dep: zod
```

## Exports

Import everything from the package root (`@yapper/schemas`). Each schema is exported alongside its inferred type (convention: `xxxSchema` value + `Xxx` type).

- **`*Schema`** (Zod schemas) — e.g. `createNoteSchema`, `noteMetadataSchema`, `shareNoteSchema`, `joinResponseSchema`, `socketHandshakeSchema`, `socketServerMessageSchema`. Use `.parse()` / `.safeParse()` at boundaries.
- **`Permission`** / **`permissionSchema`** — the `none | view | edit` enum, shared with `@yapper/permissions` semantics.
- **Inferred types** — e.g. `CreateNoteBody`, `NoteMetadata`, `ShareNoteBody`, `SocketServerMessage`. Derived with `z.infer`; import these instead of hand-writing request/response interfaces.

> Keep the contract authoritative here. If `api` needs a new field on a response, add it to the schema in this package — don't widen a local type in the app.

## When to Use

Import `@yapper/schemas` whenever data crosses between two of `web` / `api` / `socket`:

- **`api` route handlers** — parse `req.body`/`req.params` before use; return `400` on failure:
  ```ts
  import { createNoteSchema } from "@yapper/schemas";
  const parsed = createNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ issues: parsed.error.issues });
  ```
- **`socket` `onAuthenticate` / message handlers** — validate the handshake context and any client→server message before trusting it (in addition to JWT + permission checks).
- **`web` query/mutation hooks (`lib/queries/`)** — parse the `api` response so the UI never consumes an unvalidated shape; type form values with the inferred types.

**Do not** use it for:
- Purely in-app, never-serialized state (web form-only UI fields with no server counterpart can stay local).
- DB row types — those come from `@yapper/db` (`z.infer` of a Zod schema is for the wire contract, not the table).
- Business logic / permission *derivation* — that's `@yapper/permissions`; this package only describes shapes.
