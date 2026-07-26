import { describe, expect, it } from 'vitest'
import { parseDockerfile } from '../server/runtime/dockerfile-parse'

// Fixtures below are copied verbatim from this repo's own Dockerfiles at the
// time of writing (python/services/{api_gateway,auth_service}/Dockerfile,
// vue/apps/ecom-admin/Dockerfile, and nuxt/ops-dashboard/Dockerfile itself) —
// grounding the parser in real content, not guessed-at Dockerfile shape.

const API_GATEWAY_DOCKERFILE = `# Build context must be the repo root (needs python/libs/ecom_common).
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY python/pyproject.toml python/uv.lock ./
COPY python/libs ./libs
COPY python/services/api_gateway ./services/api_gateway
RUN uv sync --frozen --package api-gateway --no-dev --no-editable

FROM python:3.12-slim
RUN useradd --create-home --uid 1000 appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD \\
  python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=2).status==200 else 1)"
CMD ["uvicorn", "api_gateway.main:app", "--host", "0.0.0.0", "--port", "8080"]
`

const AUTH_SERVICE_DOCKERFILE = `# Build context must be the repo root (needs python/libs/ecom_common).
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY python/pyproject.toml python/uv.lock ./
COPY python/libs ./libs
COPY python/services/auth_service ./services/auth_service
RUN uv sync --frozen --package auth-service --no-dev --no-editable

FROM python:3.12-slim
RUN useradd --create-home --uid 1000 appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --chown=appuser:appuser python/services/auth_service/alembic.ini /app/alembic.ini
COPY --chown=appuser:appuser python/services/auth_service/alembic /app/alembic
COPY --chown=appuser:appuser deploy/docker/entrypoint.sh /app/entrypoint.sh
ENV PATH="/app/.venv/bin:$PATH"
USER appuser
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD \\
  python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/healthz',timeout=2).status==200 else 1)"
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "auth_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
`

const ECOM_ADMIN_DOCKERFILE = `# Build context is vue/ (the npm workspace root) — this app depends on
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
RUN npm run build --workspace=ecom-admin

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/ecom-admin/dist /usr/share/nginx/html
COPY apps/ecom-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
`

const OPS_DASHBOARD_DOCKERFILE = `FROM node:24-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=builder /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
`

describe('parseDockerfile — grounded in this repo\'s own real Dockerfiles', () => {
  it('parses api_gateway (2-stage, no ENTRYPOINT, HEALTHCHECK CMD must not be mistaken for a real CMD)', () => {
    const result = parseDockerfile(API_GATEWAY_DOCKERFILE)
    expect(result.stageCount).toBe(2)
    expect(result.stages).toEqual([
      { name: 'builder', baseImage: 'python:3.12-slim' },
      { name: null, baseImage: 'python:3.12-slim' },
    ])
    expect(result.baseImage).toBe('python:3.12-slim')
    expect(result.exposedPorts).toEqual([8080])
    expect(result.entrypoint).toBeNull()
    expect(result.cmd).toBe('uvicorn api_gateway.main:app --host 0.0.0.0 --port 8080')
    // Only the FINAL stage's ENV is surfaced — the builder stage's
    // UV_COMPILE_BYTECODE/UV_LINK_MODE/UV_PYTHON_DOWNLOADS must NOT appear.
    expect(result.envNames).toEqual(['PATH'])
    expect(result.argNames).toEqual([])
    expect(result.rawContent).toBe(API_GATEWAY_DOCKERFILE)
  })

  it('parses auth_service (has a real ENTRYPOINT + CMD, both exec-form arrays joined to a string)', () => {
    const result = parseDockerfile(AUTH_SERVICE_DOCKERFILE)
    expect(result.stageCount).toBe(2)
    expect(result.exposedPorts).toEqual([8001])
    expect(result.entrypoint).toBe('/app/entrypoint.sh')
    expect(result.cmd).toBe('uvicorn auth_service.main:app --host 0.0.0.0 --port 8001')
    expect(result.envNames).toEqual(['PATH'])
  })

  it('parses ecom-admin (nginx-based, unnamed final stage, no ENTRYPOINT/CMD at all in the Dockerfile itself)', () => {
    const result = parseDockerfile(ECOM_ADMIN_DOCKERFILE)
    expect(result.stageCount).toBe(2)
    expect(result.stages[1]).toEqual({ name: null, baseImage: 'nginx:1.27-alpine' })
    expect(result.baseImage).toBe('nginx:1.27-alpine')
    expect(result.exposedPorts).toEqual([80])
    expect(result.entrypoint).toBeNull()
    expect(result.cmd).toBeNull()
    expect(result.envNames).toEqual([])
  })

  it('parses this app\'s own Dockerfile (multiple single-key ENV lines, named final stage)', () => {
    const result = parseDockerfile(OPS_DASHBOARD_DOCKERFILE)
    expect(result.stageCount).toBe(2)
    expect(result.stages).toEqual([
      { name: 'builder', baseImage: 'node:24-slim' },
      { name: 'runtime', baseImage: 'node:24-slim' },
    ])
    expect(result.exposedPorts).toEqual([3000])
    expect(result.entrypoint).toBeNull()
    expect(result.cmd).toBe('node .output/server/index.mjs')
    expect(result.envNames).toEqual(['NODE_ENV', 'PORT', 'HOST'])
  })

  it('handles a completely empty/blank Dockerfile (edge case) without throwing', () => {
    const result = parseDockerfile('')
    expect(result.stageCount).toBe(0)
    expect(result.stages).toEqual([])
    expect(result.baseImage).toBe('')
    expect(result.exposedPorts).toEqual([])
    expect(result.entrypoint).toBeNull()
    expect(result.cmd).toBeNull()
    expect(result.argNames).toEqual([])
    expect(result.envNames).toEqual([])
  })

  it('parses ARG declarations and multi-port EXPOSE lines (edge case, not present in this repo\'s own 7 files today)', () => {
    const dockerfile = `FROM node:24-slim\nARG BUILD_VERSION\nARG BUILD_ENV=production\nEXPOSE 80 443/tcp\nCMD ["node", "server.js"]\n`
    const result = parseDockerfile(dockerfile)
    expect(result.argNames).toEqual(['BUILD_VERSION', 'BUILD_ENV'])
    expect(result.exposedPorts).toEqual([80, 443])
    expect(result.cmd).toBe('node server.js')
  })

  it('parses legacy (no `=`) ENV form (edge case, not present in this repo\'s own 7 files today)', () => {
    const dockerfile = `FROM node:24-slim\nENV NODE_ENV production\nCMD ["node", "server.js"]\n`
    const result = parseDockerfile(dockerfile)
    expect(result.envNames).toEqual(['NODE_ENV'])
  })

  it('falls back to shell form when CMD/ENTRYPOINT is not valid JSON (edge case)', () => {
    const dockerfile = `FROM node:24-slim\nCMD node server.js --flag\n`
    const result = parseDockerfile(dockerfile)
    expect(result.cmd).toBe('node server.js --flag')
  })
})
