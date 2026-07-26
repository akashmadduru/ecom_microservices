# Multi-stage build for the standalone ops-build-runner API.
# Build context is this directory (ops-build-runner) -- self-contained, own
# package.json/package-lock.json, mirroring nuxt/ops-dashboard's Dockerfile
# structure (see that file's own comment for the same rationale).

# ---- build stage ----------------------------------------------------------
FROM node:24-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# ---- runtime stage --------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Phase 2: GitCheckoutManager (src/git-checkout.ts) shells out to the real
# `git` binary via execFile -- needed here in the RUNTIME image, since git
# checkouts run as part of this service's own process, not inside the
# isolated build-daemon (only the resulting build context is streamed there).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Phase 2's persistent git mirror / ephemeral worktrees / build logs --
# created and chown'd here since the process itself runs as the unprivileged
# `node` user below, and WORKDIR /app is root-owned by default.
RUN mkdir -p /app/var/git-mirror /app/var/git-scratch /app/var/build-logs \
  && chown -R node:node /app/var

# Run as the built-in unprivileged node user.
USER node

# Not published to the host by default -- see docker-compose.yml, which keeps
# this service on the isolated ops_build_network only.
EXPOSE 4100
CMD ["node", "dist/index.js"]
