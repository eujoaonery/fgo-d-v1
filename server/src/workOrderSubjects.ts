import type { FogoDb } from './supabase.js'
import { DEFAULT_WORK_ORDER_SUBJECTS } from '../../src/lib/occurrenceState.js'

export type WorkOrderSubject = {
  id: string
  name: string
  active: boolean
  sortOrder: number
}

export async function ensureDefaultSubjects(db: FogoDb) {
  const rows = DEFAULT_WORK_ORDER_SUBJECTS.map((name, i) => ({
    organization_id: db.orgId,
    name,
    sort_order: (i + 1) * 10,
    active: true,
  }))
  await db.supabase.from('work_order_subjects').upsert(rows, { onConflict: 'organization_id,name', ignoreDuplicates: true })
}

export async function listWorkOrderSubjects(db: FogoDb, opts?: { includeInactive?: boolean }): Promise<WorkOrderSubject[]> {
  await ensureDefaultSubjects(db)
  let q = db.supabase
    .from('work_order_subjects')
    .select('id, name, active, sort_order')
    .eq('organization_id', db.orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
  }))
}

export async function getWorkOrderSubject(db: FogoDb, id: string): Promise<WorkOrderSubject | null> {
  const { data, error } = await db.supabase
    .from('work_order_subjects')
    .select('id, name, active, sort_order')
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    active: Boolean(data.active),
    sortOrder: Number(data.sort_order ?? 0),
  }
}

export async function createWorkOrderSubject(db: FogoDb, name: string): Promise<WorkOrderSubject> {
  const trimmed = name.trim()
  if (trimmed.length < 3) throw new Error('Informe um assunto com pelo menos 3 caracteres.')
  const { data: last } = await db.supabase
    .from('work_order_subjects')
    .select('sort_order')
    .eq('organization_id', db.orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await db.supabase
    .from('work_order_subjects')
    .insert({
      organization_id: db.orgId,
      name: trimmed,
      sort_order: Number(last?.sort_order ?? 0) + 10,
      active: true,
    })
    .select('id, name, active, sort_order')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Esse assunto já existe.')
    throw error
  }
  return {
    id: data.id as string,
    name: data.name as string,
    active: Boolean(data.active),
    sortOrder: Number(data.sort_order ?? 0),
  }
}

export async function patchWorkOrderSubject(
  db: FogoDb,
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<WorkOrderSubject | null> {
  const next: Record<string, unknown> = {}
  if (typeof patch.name === 'string') {
    const trimmed = patch.name.trim()
    if (trimmed.length < 3) throw new Error('Informe um assunto com pelo menos 3 caracteres.')
    next.name = trimmed
  }
  if (typeof patch.active === 'boolean') next.active = patch.active
  if (Object.keys(next).length === 0) return getWorkOrderSubject(db, id)
  const { data, error } = await db.supabase
    .from('work_order_subjects')
    .update(next)
    .eq('organization_id', db.orgId)
    .eq('id', id)
    .select('id, name, active, sort_order')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') throw new Error('Esse assunto já existe.')
    throw error
  }
  if (!data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    active: Boolean(data.active),
    sortOrder: Number(data.sort_order ?? 0),
  }
}
