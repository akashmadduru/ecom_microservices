import { afterEach, describe, expect, it } from 'vitest'
import { substituteEnvPlaceholders } from '../src/migrate.ts'

describe('substituteEnvPlaceholders', () => {
  const originalValue = process.env.SOME_TEST_PLACEHOLDER

  afterEach(() => {
    if (originalValue === undefined) delete process.env.SOME_TEST_PLACEHOLDER
    else process.env.SOME_TEST_PLACEHOLDER = originalValue
  })

  it('substitutes a ${VAR} placeholder from process.env', () => {
    process.env.SOME_TEST_PLACEHOLDER = 'hunter2'
    const result = substituteEnvPlaceholders("CREATE ROLE x LOGIN PASSWORD '${SOME_TEST_PLACEHOLDER}';")
    expect(result).toBe("CREATE ROLE x LOGIN PASSWORD 'hunter2';")
  })

  it('throws if the referenced environment variable is unset', () => {
    delete process.env.SOME_TEST_PLACEHOLDER
    expect(() => substituteEnvPlaceholders('${SOME_TEST_PLACEHOLDER}')).toThrow(
      /SOME_TEST_PLACEHOLDER/,
    )
  })

  it('leaves SQL with no placeholders unchanged', () => {
    const sql = 'CREATE TABLE foo (id INT);'
    expect(substituteEnvPlaceholders(sql)).toBe(sql)
  })
})
