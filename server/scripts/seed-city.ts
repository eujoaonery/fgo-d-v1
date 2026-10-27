import '../src/loadEnv.js'
import { createFogoDb, type FogoDb } from '../src/db.js'
import { generateCityCatalog } from '../src/data/cityCatalog.js'
import { hardwareIdentity, missingHardware } from '../src/data/assetHardware.js'
import { categoryToMarkerKind } from '../src/mapMarkers.js'

const CHUNK = 80

async function upsertChunks(db: FogoDb, table: string, rows: object[], conflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await db.supabase.from(table).upsert(slice, { onConflict: conflict })
    if (error) throw error
  }
}

async function listOrgRows(db: FogoDb, table: string, columns: string) {
  const page = 1000
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await db.supabase
      .from(table)
      .select(columns)
      .eq('organization_id', db.orgId)
      .range(from, from + page - 1)
    if (error) throw error
    rows.push(...((data ?? []) as Record<string, unknown>[]))
    if ((data?.length ?? 0) < page) break
  }
  return rows
}

async function main() {
  const db = await createFogoDb()
  const { teams, assets, maintenance } = generateCityCatalog()
  const now = new Date().toISOString()

  const teamRows = teams.map((t) => ({
    organization_id: db.orgId,
    external_id: t.id,
    name: t.name,
    specialty_label: t.specialty,
    capabilities: t.capabilities,
    region: t.region,
    status: t.status,
    assigned_incident_protocol: t.assignedIncidentId ?? null,
    member_names: t.members,
    map_x: t.mapX ?? null,
    map_y: t.mapY ?? null,
    updated_at: now,
  }))
  await upsertChunks(db, 'teams', teamRows, 'organization_id,external_id')

  const { data: teamDb, error: teamErr } = await db.supabase
    .from('teams')
    .select('id, external_id')
    .eq('organization_id', db.orgId)
    .in(
      'external_id',
      teams.map((t) => t.id),
    )
  if (teamErr) throw teamErr
  const teamUuid = new Map((teamDb ?? []).map((r) => [r.external_id as string, r.id as string]))

  const teamIds = [...teamUuid.values()]
  if (teamIds.length) {
    await db.supabase.from('team_members').delete().in('team_id', teamIds)
  }
  const memberRows = teams.flatMap((t) => {
    const teamId = teamUuid.get(t.id)
    if (!teamId) return []
    return t.members.map((name, sortOrder) => ({
      organization_id: db.orgId,
      team_id: teamId,
      display_name: name,
      sort_order: sortOrder,
    }))
  })
  for (let i = 0; i < memberRows.length; i += CHUNK) {
    const slice = memberRows.slice(i, i + CHUNK)
    const { error } = await db.supabase.from('team_members').insert(slice)
    if (error) throw error
  }

  const assetRows = assets.map((a) => ({
    organization_id: db.orgId,
    external_id: a.id,
    name: a.name,
    category: a.category,
    region: a.region,
    status: a.status,
    health: a.health,
    last_seen: a.lastSeen,
    map_x: a.mapX ?? null,
    map_y: a.mapY ?? null,
    patrimony_code: a.patrimonyCode ?? null,
    serial_number: a.serialNumber ?? null,
    manufacturer: a.manufacturer ?? null,
    model: a.model ?? null,
    address: a.address ?? null,
    location: a.location ?? null,
    connectivity_status: a.connectivityStatus ?? 'desconhecido',
    cadastral_status: a.cadastralStatus ?? 'operacional',
    data_origin: a.dataOrigin ?? 'manual',
    criticality: a.criticality ?? 'média',
    responsible_org: a.responsibleOrg ?? null,
    responsible_team: a.responsibleTeam ?? null,
    notes: a.notes ?? null,
    installed_at: a.installedAt ? a.installedAt.slice(0, 10) : null,
    updated_at: now,
  }))
  await upsertChunks(db, 'assets', assetRows, 'organization_id,external_id')

  const assetDb = await listOrgRows(db, 'assets', 'id, external_id')
  const assetUuid = new Map(assetDb.map((r) => [r.external_id as string, r.id as string]))

  const assetMarkers = assets
    .filter((a) => a.mapX != null && a.mapY != null)
    .map((a) => ({
      organization_id: db.orgId,
      external_id: `mk-${a.id}`,
      kind: categoryToMarkerKind(a.category),
      name: a.name,
      map_x: a.mapX,
      map_y: a.mapY,
      status: a.status,
      region: a.region,
      updated_at: now,
      asset_id: assetUuid.get(a.id) ?? null,
    }))
  const teamMarkers = teams
    .filter((t) => t.mapX != null && t.mapY != null)
    .map((t) => ({
      organization_id: db.orgId,
      external_id: `team-${t.id}`,
      kind: 'equipe',
      name: t.name,
      map_x: t.mapX,
      map_y: t.mapY,
      status: t.status === 'em campo' ? 'campo' : t.status === 'indisponível' ? 'inativo' : 'operacional',
      region: t.region,
      updated_at: now,
      incident_protocol: t.assignedIncidentId ?? null,
    }))
  await upsertChunks(db, 'map_markers', [...assetMarkers, ...teamMarkers], 'organization_id,external_id')

  const maintRows = maintenance.map((o) => ({
    organization_id: db.orgId,
    external_id: o.id,
    asset_id: o.assetId ? (assetUuid.get(o.assetId) ?? null) : null,
    asset_name: o.assetName,
    type: o.type,
    priority: o.priority,
    assignee: o.assignee,
    due_date: o.dueDate,
    status: o.status,
    description: o.description ?? null,
    origin: o.origin ?? 'catalogo-cidade',
    source_alert_protocol: o.sourceAlertId ?? null,
    opened_at: o.openedAt ?? now,
    updated_at: now,
  }))
  await upsertChunks(db, 'maintenance_orders', maintRows, 'organization_id,external_id')

  const allAssets = await listOrgRows(
    db,
    'assets',
    'id, external_id, category, serial_number, manufacturer, model, patrimony_code',
  )

  let hardwareFilled = 0
  for (const row of allAssets ?? []) {
    if (!missingHardware(row)) continue
    const hw = hardwareIdentity(String(row.external_id), String(row.category))
    const { error } = await db.supabase
      .from('assets')
      .update({
        serial_number: hw.serialNumber,
        manufacturer: hw.manufacturer,
        model: hw.model,
        patrimony_code: hw.patrimonyCode,
        updated_at: now,
      })
      .eq('id', row.id)
    if (error) throw error
    hardwareFilled++
  }

  const cameras = assets.filter((a) => a.category.toLowerCase().includes('câmera')).length
  console.log(
    `[fogo] Catálogo municipal gravado org=${db.orgSlug}: ${teams.length} equipes, ${assets.length} ativos (${cameras} câmeras), ${maintenance.length} OS de manutenção. Cadastro técnico preenchido em ${hardwareFilled} ativos.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
