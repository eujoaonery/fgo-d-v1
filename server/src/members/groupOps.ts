import type { CcoPermissions } from '../../../src/lib/ccoPermissions.js'
import {
  CITY_ADMIN_GROUP_CIDADE,
  CITY_ADMIN_GROUP_SISTEMA,
  cityAdminPresetPermissions,
  emptyPermissions,
  fieldPresetPermissions,
  isPlatformAdminGroupName,
  maintenancePresetPermissions,
  managerPresetPermissions,
  operatorPresetPermissions,
  parseRawPermissions,
  serializePermissions,
  systemAdminPresetPermissions,
  viewOnlyPermissions,
} from '../../../src/lib/ccoPermissions.js'
import type { FogoDb } from '../db.js'
import { dbForTenant } from '../db.js'
import { writeAudit } from '../audit.js'
import { listOrganizations } from '../tenant/orgs.js'

export type OrgGroupRecord = {
  id: string
  name: string
  description: string | null
  permissions: CcoPermissions
  memberCount: number
  createdAt: string
}

function rowToGroup(row: {
  id: string
  name: string
  description: string | null
  permissions: unknown
  created_at: string
  member_count?: number
}): OrgGroupRecord {
  const perms = parseRawPermissions(row.permissions)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: perms,
    memberCount: row.member_count ?? 0,
    createdAt: row.created_at,
  }
}

export async function listOrgGroups(db: FogoDb): Promise<OrgGroupRecord[]> {
  const { data, error } = await db.supabase
    .from('organization_groups')
    .select('id, name, description, permissions, created_at')
    .eq('organization_id', db.orgId)
    .order('name')
  if (error) throw error

  const { data: counts } = await db.supabase
    .from('organization_members')
    .select('group_id')
    .eq('organization_id', db.orgId)
  const countMap = new Map<string, number>()
  for (const row of counts ?? []) {
    if (row.group_id) countMap.set(row.group_id, (countMap.get(row.group_id) ?? 0) + 1)
  }

  return (data ?? []).map((g) =>
    rowToGroup({ ...g, member_count: countMap.get(g.id) ?? 0 }),
  )
}

export async function createOrgGroup(
  db: FogoDb,
  body: { name: string; description?: string; permissions?: CcoPermissions },
) {
  const name = body.name.trim()
  if (!name) throw new Error('Nome do grupo é obrigatório')
  if (isPlatformAdminGroupName(name)) {
    throw new Error(
      'Administrador de plataforma gerencia todas as cidades e não pode ser criado no CCO municipal. Use Administrador de cidade ou Administrador do sistema.',
    )
  }
  const perms = body.permissions ?? emptyPermissions()
  const { data, error } = await db.supabase
    .from('organization_groups')
    .insert({
      organization_id: db.orgId,
      name,
      description: body.description?.trim() || null,
      permissions: serializePermissions(perms),
    })
    .select('id, name, description, permissions, created_at')
    .single()
  if (error) throw error
  await writeAudit(db, 'group.create', 'organization_group', { groupId: data.id, name }, data.id)
  return rowToGroup({ ...data, member_count: 0 })
}

export async function updateOrgGroup(
  db: FogoDb,
  groupId: string,
  body: { name?: string; description?: string; permissions?: CcoPermissions },
) {
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (isPlatformAdminGroupName(name)) {
      throw new Error(
        'Administrador de plataforma gerencia todas as cidades e não pode ser criado no CCO municipal. Use Administrador de cidade ou Administrador do sistema.',
      )
    }
    patch.name = name
  }
  if (body.description !== undefined) patch.description = body.description.trim() || null
  if (body.permissions) patch.permissions = serializePermissions(body.permissions)

  const { data: previous } = await db.supabase
    .from('organization_groups')
    .select('id, name, permissions')
    .eq('organization_id', db.orgId)
    .eq('id', groupId)
    .maybeSingle()

  const { data, error } = await db.supabase
    .from('organization_groups')
    .update(patch)
    .eq('organization_id', db.orgId)
    .eq('id', groupId)
    .select('id, name, description, permissions, created_at')
    .single()
  if (error) throw error
  if (!data) throw new Error('Grupo não encontrado')

  const { count } = await db.supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', db.orgId)
    .eq('group_id', groupId)

  await writeAudit(
    db,
    'group.update',
    'organization_group',
    {
      groupId,
      name: data.name,
      before: previous ? { name: previous.name, permissions: previous.permissions } : null,
      after: { name: data.name, permissions: data.permissions },
    },
    data.id,
  )
  return rowToGroup({ ...data, member_count: count ?? 0 })
}

export async function deleteOrgGroup(db: FogoDb, groupId: string) {
  const { count } = await db.supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', db.orgId)
    .eq('group_id', groupId)
  if ((count ?? 0) > 0) {
    throw new Error('Remova ou reatribua os usuários deste grupo antes de excluí-lo')
  }
  const { error } = await db.supabase
    .from('organization_groups')
    .delete()
    .eq('organization_id', db.orgId)
    .eq('id', groupId)
  if (error) throw error
  await writeAudit(db, 'group.delete', 'organization_group', { groupId })
}

/** Grupos alinhados aos papéis §5 — cria os que ainda não existem. */
export async function ensureDefaultOrgGroups(db: FogoDb) {
  const { data, error } = await db.supabase
    .from('organization_groups')
    .select('id, name')
    .eq('organization_id', db.orgId)
  if (error) throw error
  const existing = new Set((data ?? []).map((g) => g.name.trim().toLowerCase()))

  const presets: { name: string; description: string; permissions: CcoPermissions }[] = [
    {
      name: CITY_ADMIN_GROUP_CIDADE,
      description:
        'Acesso total à cidade: operações, usuários, configurações e integrações. Substitui o administrador de plataforma no CCO municipal.',
      permissions: cityAdminPresetPermissions(),
    },
    {
      name: CITY_ADMIN_GROUP_SISTEMA,
      description:
        'Acesso a tudo na cidade, menos configurações de API e integrações de dados.',
      permissions: systemAdminPresetPermissions(),
    },
    {
      name: 'Gestores',
      description: '§5.2 Gestor de mobilidade — indicadores e relatórios da região autorizada.',
      permissions: managerPresetPermissions(),
    },
    {
      name: 'Operadores',
      description: '§5.3 Operador da central — mapa, alertas e ocorrências.',
      permissions: operatorPresetPermissions(),
    },
    {
      name: 'Manutenção',
      description: '§5.4 Equipe de manutenção — ordens atribuídas e evidências.',
      permissions: maintenancePresetPermissions(),
    },
    {
      name: 'Campo',
      description: '§5.5 Agente de campo — escala, tarefas e ocorrências atribuídas.',
      permissions: fieldPresetPermissions(),
    },
    {
      name: 'Auditores',
      description: '§5.6 Auditor / consulta — leitura sem alteração; exportação só se concedida.',
      permissions: viewOnlyPermissions(),
    },
  ]

  let created = 0
  for (const g of presets) {
    if (existing.has(g.name.toLowerCase())) continue
    await createOrgGroup(db, g)
    created++
  }

  const presetByName = new Map(presets.map((g) => [g.name.trim().toLowerCase(), g.permissions]))
  const { data: storedPerms } = await db.supabase
    .from('organization_groups')
    .select('id, name, permissions')
    .eq('organization_id', db.orgId)
  for (const row of storedPerms ?? []) {
    const preset = presetByName.get(String(row.name ?? '').trim().toLowerCase())
    if (!preset?.forecasts.view) continue
    const raw = row.permissions
    if (raw && typeof raw === 'object' && 'forecasts' in raw) continue
    const base = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
    base.forecasts = {
      view: true,
      manage: preset.forecasts.manage,
      export: preset.forecasts.export,
    }
    await db.supabase
      .from('organization_groups')
      .update({ permissions: base })
      .eq('organization_id', db.orgId)
      .eq('id', row.id)
  }

  const { data: after } = await db.supabase
    .from('organization_groups')
    .select('id, name')
    .eq('organization_id', db.orgId)
  const cidadeId = (after ?? []).find((g) => g.name.trim().toLowerCase() === CITY_ADMIN_GROUP_CIDADE.toLowerCase())?.id
  if (cidadeId) {
    await db.supabase
      .from('organization_members')
      .update({ group_id: cidadeId })
      .eq('organization_id', db.orgId)
      .eq('role', 'admin')
      .is('group_id', null)
  }

  for (const row of after ?? []) {
    if (!isPlatformAdminGroupName(row.name)) continue
    await db.supabase
      .from('organization_members')
      .update({ group_id: cidadeId ?? null, role: 'admin' })
      .eq('organization_id', db.orgId)
      .eq('group_id', row.id)
    const { count } = await db.supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', db.orgId)
      .eq('group_id', row.id)
    if ((count ?? 0) === 0) {
      await db.supabase.from('organization_groups').delete().eq('organization_id', db.orgId).eq('id', row.id)
    }
  }

  if (created) console.log(`[fogo] ${created} grupo(s) de permissão criados em ${db.orgSlug}.`)
}

export async function ensureDefaultOrgGroupsForAll(db: FogoDb) {
  const orgs = await listOrganizations(db.supabase)
  for (const tenant of orgs) {
    await ensureDefaultOrgGroups(dbForTenant(db.supabase, tenant))
  }
}
