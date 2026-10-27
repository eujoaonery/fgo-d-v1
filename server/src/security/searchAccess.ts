import type { CcoModuleKey } from '../../../src/lib/ccoPermissions.js'
import type { SearchHit } from '../types.js'
import type { ResolvedActor } from '../permissions.js'
import { actorCan } from '../permissions.js'

const kindModule: Record<SearchHit['kind'], CcoModuleKey> = {
  asset: 'assets',
  team: 'teams',
  alert: 'alerts',
  incident: 'incidents',
}

export function filterSearchHits(hits: SearchHit[], actor: ResolvedActor): SearchHit[] {
  return hits.filter((h) => actorCan(actor, kindModule[h.kind], 'view'))
}
