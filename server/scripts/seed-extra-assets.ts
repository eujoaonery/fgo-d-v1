import '../src/loadEnv.js'
import { createFogoDb } from '../src/db.js'
import { generateExtraCoverageAssets } from '../src/data/cityCatalog.js'
import { upsertAsset } from '../src/repository.js'

async function main() {
  const db = await createFogoDb()
  const extras = generateExtraCoverageAssets()
  const { data: existing, error } = await db.supabase
    .from('assets')
    .select('external_id')
    .eq('organization_id', db.orgId)
    .in(
      'external_id',
      extras.map((a) => a.id),
    )
  if (error) throw error
  const have = new Set((existing ?? []).map((r) => String(r.external_id)))
  const fresh = extras.filter((a) => !have.has(a.id))
  for (const asset of fresh) {
    await upsertAsset(db, asset, 'asset.create')
  }
  const north = extras.filter((a) => a.region === 'Zona Norte').length
  console.log(
    `[fogo] Cobertura extra gravada org=${db.orgSlug}: ${fresh.length} novos / ${extras.length} no pacote (${north} na Zona Norte). Já existentes: ${have.size}.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
