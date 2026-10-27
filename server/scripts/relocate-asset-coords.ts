import '../src/loadEnv.js'
import { createFogoClient } from '../src/supabase.js'
import { parseAssetLocation } from '../src/data/mariliaAddresses.js'
import { latLngToMapPercent, roundCoord } from '../../src/lib/mariliaGeo.js'
import { fractionForNumber, needsStreetPlacement, pointAlongLine } from '../../src/lib/streetPlacement.js'
import { lookupStreet } from '../src/geo/streetLookup.js'
import type { AssetLocation } from '../src/types.js'

type Row = {
  id: string
  external_id: string
  region: string
  location: unknown
  address: string | null
}

function withoutPoint(loc: AssetLocation): AssetLocation {
  const next: AssetLocation = { ...loc }
  delete next.lat
  delete next.lng
  delete next.coordOrigin
  delete next.coordPrecisionM
  delete next.numberConfirmed
  return next
}

async function main() {
  const { supabase } = await createFogoClient()
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, slug')
  if (orgErr) throw orgErr

  for (const org of orgs ?? []) {
    let placed = 0
    let cleared = 0
    let skipped = 0
    const { data, error } = await supabase
      .from('assets')
      .select('id, external_id, region, location, address')
      .eq('organization_id', org.id)
    if (error) throw error
    for (const row of (data ?? []) as Row[]) {
      const loc = parseAssetLocation(row.location)
      if (!needsStreetPlacement(row.external_id, row.region, loc) || !loc) {
        skipped++
        continue
      }
      const hit = await lookupStreet(loc.street, loc.neighborhood)
      const spot = hit ? pointAlongLine(hit.line, fractionForNumber(loc.number)) : null
      if (!hit || !spot) {
        const hadGuess = loc.lat != null && loc.lng != null
        if (!hadGuess) {
          skipped++
          continue
        }
        const clearedLoc = withoutPoint(loc)
        const { error: upErr } = await supabase
          .from('assets')
          .update({ location: clearedLoc, map_x: null, map_y: null, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (upErr) throw upErr
        cleared++
        continue
      }
      const next: AssetLocation = {
        ...loc,
        lat: roundCoord(spot.lat),
        lng: roundCoord(spot.lng),
        coordOrigin: 'geocodificacao',
        coordPrecisionM: 80,
        numberConfirmed: false,
      }
      const perc = latLngToMapPercent(next.lat!, next.lng!)
      const { error: upErr } = await supabase
        .from('assets')
        .update({
          location: next,
          map_x: perc.x,
          map_y: perc.y,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (upErr) throw upErr
      placed++
    }
    console.log(`${org.slug}: colocados ${placed}, sem rua ${cleared}, mantidos ${skipped}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
