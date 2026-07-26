import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

/**
 * Small, explicit, forward-only SQL migration runner -- the same "numbered,
 * ordered, reviewable" spirit as this repo's Python services' Alembic
 * migrations (python/services/{name}/alembic/versions/NNNN_{name}.py), without pulling
 * in Alembic itself for a schema this small (2 tables). Migrations are never
 * edited after they ship; a schema change ships as a new, higher-numbered
 * file.
 *
 * Runs against `MIGRATION_DATABASE_URL` -- a superuser/DB-owner connection,
 * NEVER the narrow `build_runner_app` role this migration set itself creates
 * (see 0003_app_role_and_privileges.sql). The running application connects
 * with `DATABASE_URL` instead (see db.ts) -- the two are deliberately
 * different roles.
 *
 * `${ENV_VAR}` placeholders in a migration file are substituted from
 * `process.env` before execution -- used by 0003 for
 * `BUILD_RUNNER_APP_DB_PASSWORD`, mirroring
 * deploy/postgres/init-databases.sh's own established pattern of
 * interpolating environment-supplied passwords into committed SQL. No
 * migration file may contain a real secret; only the placeholder syntax.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

export function substituteEnvPlaceholders(sql: string): string {
  return sql.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name: string) => {
    const value = process.env[name]
    if (value === undefined) {
      throw new Error(`Migration references \${${name}}, but that environment variable is unset.`)
    }
    return value
  })
}

async function run(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL
  if (!connectionString) {
    console.error('MIGRATION_DATABASE_URL is not configured; refusing to run migrations.')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (row) => row.filename,
      ),
    )

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort() // filenames are zero-padded (0001_, 0002_, ...), so lexicographic order is numeric order.

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skipping already-applied ${file}`)
        continue
      }

      console.log(`[migrate] applying ${file}`)
      const rawSql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      const sql = substituteEnvPlaceholders(rawSql)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }

    console.log('[migrate] done')
  } finally {
    await client.end()
  }
}

// Only auto-run when executed directly (`npm run migrate`) -- guarded so
// `substituteEnvPlaceholders` can be unit-tested by importing this module
// without triggering a real migration run against MIGRATION_DATABASE_URL.
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  run().catch((err: unknown) => {
    console.error('[migrate] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
