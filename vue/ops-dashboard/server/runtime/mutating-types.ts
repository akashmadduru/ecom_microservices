/**
 * Phase 2 mutating runtime abstraction.
 *
 * This is a SEPARATE interface from `RuntimeProvider` (server/runtime/types.ts)
 * ON PURPOSE. That interface carries an explicit "read-only by design" guarantee
 * and must never gain mutating methods. Keeping stop/start/restart here means the
 * read-only surface stays honestly read-only, and any code that only holds a
 * `RuntimeProvider` provably cannot mutate anything.
 *
 * The set is intentionally minimal: exactly stop, start, restart. There is
 * deliberately NO create / remove / exec / rebuild here — those are out of scope
 * for this project and enabling them would widen the blast radius well beyond
 * "manage the lifecycle of an already-existing local dev container".
 */
export interface MutatingRuntimeProvider {
  stopContainer(id: string): Promise<void>
  startContainer(id: string): Promise<void>
  restartContainer(id: string): Promise<void>
}
