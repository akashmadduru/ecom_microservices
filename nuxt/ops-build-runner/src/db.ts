import pg from 'pg'

const { Pool } = pg
export type { PoolClient } from 'pg'

let pool: pg.Pool | undefined

/**
 * Lazily-constructed singleton pool against `DATABASE_URL` -- the
 * `build_runner_app` narrow role (see migrations/0003_app_role_and_privileges.sql),
 * never the migration/superuser connection.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured.')
    }
    pool = new Pool({ connectionString })
  }
  return pool
}

/** Test/shutdown helper -- lets tests and the process's own signal handlers reset the pool. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
