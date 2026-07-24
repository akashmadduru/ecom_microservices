# Build context is vue/ (the npm workspace root) — this app depends on
# packages/lib and packages/core as workspace siblings, so the context must
# include them, but nothing outside vue/ is needed.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/ecom-admin/package.json apps/ecom-admin/package.json
COPY packages/lib/package.json packages/lib/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --workspace=ecom-admin
COPY . .
# Vite inlines VITE_* env vars at build time (not container runtime), so the
# committed .env is baked in here. Per-environment builds are a later concern.
RUN npm run build --workspace=ecom-admin

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/ecom-admin/dist /usr/share/nginx/html
COPY apps/ecom-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
