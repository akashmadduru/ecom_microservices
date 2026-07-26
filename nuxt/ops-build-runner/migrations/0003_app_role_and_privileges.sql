-- Dedicated, narrowly-scoped Postgres role for the running application --
-- NOT the superuser/migration-runner role. This is a real, load-bearing
-- security property, not just a comment: audit_log's tamper-resistance
-- depends on this role genuinely lacking UPDATE/DELETE on it at the database
-- privilege layer, so even a fully compromised application process (RCE in
-- this service, not just a stolen BUILD_RUNNER_TOKEN) cannot rewrite or erase
-- its own audit trail -- it can only ever append to it.
--
-- The role's password is supplied via the BUILD_RUNNER_APP_DB_PASSWORD
-- environment variable and substituted into this file's ${BUILD_RUNNER_APP_DB_PASSWORD}
-- placeholder by the migration runner (src/migrate.ts) before it is executed
-- -- mirroring deploy/postgres/init-databases.sh's own established pattern of
-- interpolating environment-supplied passwords into committed SQL templates.
-- This file itself never contains, and must never be edited to contain, a
-- real secret.
--
-- This migration is applied using MIGRATION_DATABASE_URL (a superuser /
-- database-owner connection), never the narrow role it creates -- the running
-- application connects with DATABASE_URL, which points at build_runner_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'build_runner_app') THEN
    CREATE ROLE build_runner_app LOGIN PASSWORD '${BUILD_RUNNER_APP_DB_PASSWORD}';
  ELSE
    ALTER ROLE build_runner_app WITH LOGIN PASSWORD '${BUILD_RUNNER_APP_DB_PASSWORD}';
  END IF;
END
$$;

-- build_requests: the workflow legitimately needs to update its own state/
-- timestamp columns as the process advances. Rows are never deleted (a
-- cancelled/expired/rejected/torn_down request stays in the table as its own
-- permanent record) -- no DELETE grant, ever.
GRANT SELECT, INSERT, UPDATE ON build_requests TO build_runner_app;

-- audit_log: append-only from the application's point of view. INSERT/SELECT
-- only -- explicitly NO UPDATE, NO DELETE. This is the enforced property, not
-- merely the intent.
GRANT SELECT, INSERT ON audit_log TO build_runner_app;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO build_runner_app;
