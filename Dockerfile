# Runtime image for the Bun services. Pick one with --build-arg APP=api|socket.
# Build context is the repo root: both apps import workspace packages, so they need the whole tree.
FROM oven/bun:1.3-alpine
ARG APP
WORKDIR /repo

# Manifests first so `bun install` is cached until a dependency actually changes.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/socket/package.json apps/socket/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/editor/package.json packages/editor/
COPY packages/permissions/package.json packages/permissions/
COPY packages/schemas/package.json packages/schemas/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN bun install --frozen-lockfile

COPY packages packages
COPY apps/${APP} apps/${APP}

ENV NODE_ENV=production
WORKDIR /repo/apps/${APP}
USER bun
# ponytail: Bun runs TypeScript straight from src, so neither service needs a build step.
CMD ["bun", "run", "src/index.ts"]
