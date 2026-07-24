# Build context must be the repo root (needs python/libs/ecom_common).
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
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "auth_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
