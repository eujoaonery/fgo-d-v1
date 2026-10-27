import type { CcoModuleKey } from '../../src/lib/ccoPermissions.js'
import { parseMapMunicipality } from '../../src/lib/mapMunicipality.js'
import { actorCan } from './permissions.js'
import { bootstrap } from './repository.js'
import type { RequestFogoDb } from './orgContext.js'
import {
  actorRegion,
  filterAlertsForActor,
  filterAssetsForActor,
  filterIncidentsForActor,
  filterMaintenanceForActor,
  filterTeamsForActor,
  teamLocationVisible,
} from './security/scopeFilter.js'

export async function bootstrapForActor(db: RequestFogoDb) {
  const actor = db.actor
  if (!actor) throw new Error('Autenticação necessária')

  const full = await bootstrap(db)
  const can = (module: CcoModuleKey, action: 'view' | 'manage' = 'view') =>
    actorCan(actor, module, action)

  const incidents = can('incidents', 'view') ? filterIncidentsForActor(full.incidents, actor) : []
  const alerts = can('alerts', 'view') ? filterAlertsForActor(full.alerts, actor) : []
  const assets = can('assets', 'view') ? filterAssetsForActor(full.assets, actor) : []
  const maintenance = can('incidents', 'view') ? filterMaintenanceForActor(full.maintenance, actor) : []
  let teams = can('teams', 'view') ? filterTeamsForActor(full.teams, actor) : []
  if (!teamLocationVisible(actor, actor.locationShareUntil)) {
    teams = teams.map((t) => ({ ...t, mapX: undefined, mapY: undefined }))
  }

  const scopedRegion = actorRegion(actor)
  const mapMarkers = can('overview', 'view')
    ? full.mapMarkers.filter((m) => !scopedRegion || !m.region || m.region === scopedRegion)
    : []

  return {
    serverTime: full.serverTime,
    ...(can('settings', 'view') || can('overview', 'view')
      ? { simulation: full.simulation }
      : { simulation: null }),
    incidents,
    alerts,
    ...(can('overview', 'view') ? { activity: full.activity } : { activity: [] }),
    assets,
    maintenance,
    teams,
    ...(can('assets', 'view') || can('cityInventory', 'view')
      ? { assetCategories: full.assetCategories }
      : { assetCategories: [] }),
    ...(can('overview', 'view')
      ? { mapMarkers, cityMapImage: full.cityMapImage }
      : { mapMarkers: [], cityMapImage: null }),
    mapHome: parseMapMunicipality(db.tenant?.settings),
  }
}
