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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Run as the built-in unprivileged node user.
USER node

# Not published to the host by default -- see docker-compose.yml, which keeps
# this service on the isolated ops_build_network only.
EXPOSE 4100
CMD ["node", "dist/index.js"]
