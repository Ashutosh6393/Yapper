# Web image. Build from the repo root: `docker build -f apps/web/Dockerfile .`
# NEXT_PUBLIC_* are baked into the bundle at build time, so this image is environment-specific.
FROM oven/bun:1.3-alpine AS builder
WORKDIR /repo
# The post-build precache script (spec 24b) runs under node, which the bun image lacks.
RUN apk add --no-cache nodejs

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
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SYNC_ENGINE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_SYNC_ENGINE=$NEXT_PUBLIC_SYNC_ENGINE \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/apps/web
RUN bun run build

# `output: "standalone"` emits a self-contained server plus only the node_modules it traced.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
