# Build context is this directory (apps/ecom-web) — unlike the Python
# services, the frontend has no dependency on anything outside its own tree.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* env vars at build time (not container runtime), so the
# committed .env is baked in here. Per-environment builds are a later concern.
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
