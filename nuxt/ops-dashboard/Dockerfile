# Multi-stage build for the standalone ops-dashboard.
# Build context is this directory (vue/ops-dashboard) — it depends on nothing
# outside itself, which is the whole point of the standalone design.

# ---- build stage ----------------------------------------------------------
FROM node:24-slim AS builder
WORKDIR /app

# Install deps against the committed lockfile for reproducibility.
COPY package.json package-lock.json ./
RUN npm ci

# Build the Nuxt app -> .output (Nitro node server).
COPY . .
RUN npm run build

# ---- runtime stage --------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
# Nitro's node server binds this port (Nuxt/Nitro default is 3000).
ENV PORT=3000
# Binds all interfaces INSIDE the container. Loopback-only exposure on the HOST
# is enforced entirely by docker-compose.ops.yml's "127.0.0.1:9010:3000" port
# publish, not here — running this image with a different publish spec (or
# `docker run -p 9010:3000`) exposes the (still token-guarded) API on every
# host interface. Keep the compose file's loopback publish when deploying.
ENV HOST=0.0.0.0
WORKDIR /app

# Only the self-contained server bundle is needed at runtime; node_modules are
# already inlined into .output by Nitro.
COPY --from=builder /app/.output ./.output

# Run as the built-in unprivileged node user.
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
