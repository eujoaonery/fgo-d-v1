import { urbanAssets as seedAssets } from '../../src/data/assets.ts'
import type { FogoDb } from './db.js'
import { seedFleetAssets } from './data/seedFleet.js'
import { coversMunicipalRole, seedTeams } from './data/seedTeams.js'
import { isSeeded, listTeams, upsertAsset, upsertTeam } from './repository.js'

export async function runSeedIfNeeded(db: FogoDb) {
  const existing = await listTeams(db)
  if (existing.length === 0) {
    for (const team of seedTeams) {
      await upsertTeam(db, team, 'team.create')
    }
    console.log('[fogo] Equipes operacionais cadastradas.')
  } else {
    const missing = seedTeams.filter((team) => {
      const role = team.id === 'EQ-PM' ? 'pm' : team.id === 'EQ-GM' ? 'gm' : team.id === 'EQ-GT' ? 'gt' : null
      if (!role) return false
      if (existing.some((row) => row.id === team.id)) return false
      return !existing.some((row) => coversMunicipalRole(row, role))
    })
    for (const team of missing) {
      await upsertTeam(db, team, 'team.create')
    }
    if (missing.length) {
      console.log(`[fogo] Equipes municipais incluídas: ${missing.map((team) => team.name).join(', ')}.`)
    }
  }

  await ensureSeedFleet(db)

  if (await isSeeded(db)) return

  for (const asset of seedAssets) {
    await upsertAsset(db, asset)
  }

  console.log('[fogo] Seed Supabase aplicado (cadastro de ativos).')
}

/** Inclui a frota municipal só quando o veículo ainda não existe. Não regrava alteração feita depois. */
async function ensureSeedFleet(db: FogoDb) {
  const fleet = seedFleetAssets()
  const ids = fleet.map((asset) => asset.id)
  const { data, error } = await db.supabase
    .from('assets')
    .select('external_id')
    .eq('organization_id', db.orgId)
    .in('external_id', ids)
  if (error) throw error
  const present = new Set((data ?? []).map((row) => String(row.external_id)))
  const missing = fleet.filter((asset) => !present.has(asset.id))
  for (const asset of missing) {
    await upsertAsset(db, asset, 'asset.create')
  }
  if (missing.length) {
    console.log(`[fogo] Frota incluída: ${missing.map((asset) => asset.name).join(', ')}.`)
  }
}
