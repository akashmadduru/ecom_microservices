#!/bin/sh
# Shared entrypoint for every DB-backed service: wait for Postgres, run
# migrations, then exec the app (as PID 1, so it receives signals directly
# for graceful shutdown). Idempotent — `alembic upgrade head` is a no-op
# when the DB is already at head, so this is safe to run on every restart.
set -e

echo "[entrypoint] waiting for database..."
python -m ecom_common.wait_for_db

echo "[entrypoint] running migrations..."
alembic -c /app/alembic.ini upgrade head

echo "[entrypoint] starting application..."
exec "$@"
