import type { RequestActor } from './orgContext.js'

export function actorDisplayLabel(actor?: RequestActor | null): string {
  const name = actor?.displayName?.trim()
  if (name) return name
  if (actor?.email) return actor.email
  return 'operador CCO'
}
