import '../src/loadEnv.js'
import { createFogoDb } from '../src/db.js'
import { formatAssetAddress, mariliaAddressFor, parseAssetLocation } from '../src/data/mariliaAddresses.js'

type AssetRow = {
  id: string
  external_id: string
  region: string
  address: string | null
  location: unknown
  data_origin: string | null
}

async function main() {
  const db = await createFogoDb()
  const { data, error } = await db.supabase
    .from('assets')
    .select('id, external_id, region, address, location, data_origin')
    .eq('organization_id', db.orgId)
  if (error) throw error

  const rows = (data ?? []) as AssetRow[]
  let updated = 0
  for (const row of rows) {
    const location = parseAssetLocation(row.location) ?? mariliaAddressFor(row.external_id, row.region)
    const address = formatAssetAddress(location)
    const dataOrigin = row.data_origin ?? 'manual'
    const { error: upErr } = await db.supabase
      .from('assets')
      .update({ location, address, data_origin: dataOrigin, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (upErr) throw upErr
    updated++
  }
  console.log(`Endereços Marília: ${updated} de ${rows.length} ativos sincronizados (cadastro único).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
