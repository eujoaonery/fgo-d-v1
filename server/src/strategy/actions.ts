import type { FogoDb } from '../db.js'
import {
  ACTION_CATALOG,
  actionCatalogEntry,
  type ActionCatalogEntry,
  type StrategicActionRecord,
  type StrategicActionStatus,
  type StrategicActionType,
} from '../../../src/lib/strategy.js'
import { createMaintenanceOrder, listAssets, listIncidents, listTeams } from '../repository.js'
import type { IncidentPriority, Team } from '../types.js'
import {
  createStrategicAction,
  getStrategicAction,
  insertActionEvent,
  insertContingencyPlan,
  latestContingencyVersion,
  updateStrategicAction,
} from './store.js'
import { loadPrometheusCredentials } from '../orgIntegrations.js'

export class ActionError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function strList(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key]
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  return str(payload, key)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function channelConfigured(envName: string | null, channels?: Record<string, string>): boolean {
  if (!envName) return true
  if (channels?.[envName]?.trim()) return true
  return !!process.env[envName]?.trim()
}

export async function catalogWithChannels(db: FogoDb): Promise<(ActionCatalogEntry & { channelReady: boolean })[]> {
  const creds = await loadPrometheusCredentials(db)
  return ACTION_CATALOG.map((a) => ({ ...a, channelReady: channelConfigured(a.channelEnv, creds.channels) }))
}

export function validateActionPayload(type: StrategicActionType, payload: Record<string, unknown>): string[] {
  const entry = actionCatalogEntry(type)
  if (!entry) return ['Tipo de ação desconhecido.']
  const errors: string[] = []
  for (const field of entry.fields) {
    if (!field.required) continue
    const value = payload[field.key]
    const empty =
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    if (empty) errors.push(`Campo obrigatório: ${field.label}.`)
  }
  if (type === 'public_alert') {
    const start = Date.parse(str(payload, 'startsAt'))
    const end = Date.parse(str(payload, 'validUntil'))
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      errors.push('A validade deve ser posterior ao início.')
    }
  }
  return errors
}

export function proposeTeamRedistribution(
  teams: Team[],
  region: string,
  selectedIds: string[],
): { lines: string[]; estimatedImpact: string; unknownTravel: boolean } {
  const selected = teams.filter((t) => selectedIds.includes(t.id))
  const available = selected.filter((t) => t.status === 'disponível')
  const lines = selected.map((t) => {
    const matchRegion = region && t.region.toLowerCase() === region.toLowerCase()
    const travel = matchRegion ? 'já na região' : 'deslocamento não geolocalizado (equipe sem coordenada cadastral confiável)'
    return `${t.name} (${t.status}) · ${t.specialty} · ${travel}`
  })
  const unknownTravel = selected.some((t) => !region || t.region.toLowerCase() !== region.toLowerCase())
  const estimatedImpact = [
    `${available.length} de ${selected.length} equipe(s) selecionada(s) estão disponíveis.`,
    unknownTravel ? 'Tempo de deslocamento não calculado: falta posição cadastral da equipe.' : 'Equipes já alocadas na região informada.',
  ].join(' ')
  return { lines, estimatedImpact, unknownTravel }
}

async function postWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; bodyPreview: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'FOGO-CCO/1.0' },
      body: JSON.stringify(body),
    })
    const text = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, bodyPreview: text.slice(0, 400) }
  } catch (e) {
    return { ok: false, status: 0, bodyPreview: e instanceof Error ? e.message : 'falha de rede' }
  } finally {
    clearTimeout(timer)
  }
}

export async function createActionDraft(
  db: FogoDb,
  input: {
    actionType: StrategicActionType
    payload: Record<string, unknown>
    justification: string
    region: string
    title?: string
    requestApproval?: boolean
  },
): Promise<StrategicActionRecord> {
  const errors = validateActionPayload(input.actionType, input.payload)
  if (!input.justification.trim()) errors.push('Informe o motivo e a justificativa.')
  if (errors.length) throw new ActionError('VALIDATION', errors.join(' '))
  const entry = actionCatalogEntry(input.actionType)!
  const status: StrategicActionStatus = input.requestApproval ? 'pending_approval' : 'draft'
  const title =
    input.title?.trim() ||
    `${entry.title}${input.region ? ` — ${input.region}` : ''}`
  return createStrategicAction(db, {
    actionType: input.actionType,
    title,
    payload: input.payload,
    justification: input.justification,
    region: input.region,
    status,
  })
}

export async function requestApproval(db: FogoDb, protocol: string): Promise<StrategicActionRecord> {
  const action = await getStrategicAction(db, protocol)
  if (!action) throw new ActionError('NOT_FOUND', 'Ação não encontrada.')
  if (action.status !== 'draft' && action.status !== 'pending_approval') {
    throw new ActionError('INVALID_STATE', 'Só rascunhos podem ser enviados para aprovação.')
  }
  const errors = validateActionPayload(action.actionType, action.payload)
  if (errors.length) throw new ActionError('VALIDATION', errors.join(' '))
  const updated = await updateStrategicAction(db, protocol, { status: 'pending_approval' })
  await insertActionEvent(db, updated.id, 'approval_requested')
  return updated
}

async function executeInternal(db: FogoDb, action: StrategicActionRecord): Promise<{
  status: StrategicActionStatus
  result: Record<string, unknown>
  linkedEntity?: string
}> {
  const entry = actionCatalogEntry(action.actionType)!
  const payload = action.payload

  if (action.actionType === 'preventive_maintenance') {
    const assetId = str(payload, 'assetId')
    const assets = await listAssets(db)
    const asset = assets.find((a) => a.id === assetId)
    if (!asset) throw new ActionError('VALIDATION', 'Ativo informado não está cadastrado.')
    const open = (await listIncidents(db)).filter(
      (i) =>
        i.relatedAssetId === asset.id &&
        i.type === 'preventiva' &&
        i.status !== 'resolvida' &&
        i.status !== 'cancelada',
    )
    if (open.length) {
      return {
        status: 'failed',
        result: {
          sent: false,
          duplicate: true,
          existing: open.map((o) => o.id),
          message: `Já existe ordem preventiva aberta para ${asset.id}: ${open.map((o) => o.id).join(', ')}. Nenhuma ordem nova foi criada.`,
        },
        linkedEntity: open[0].id,
      }
    }
    const priority = str(payload, 'priority') as IncidentPriority
    const dueRaw = str(payload, 'dueDate')
    const dueDate = dueRaw.slice(0, 10)
    const order = await createMaintenanceOrder(db, {
      assetId: asset.id,
      assetName: asset.name,
      type: 'preventiva',
      priority: ['baixa', 'média', 'alta', 'crítica'].includes(priority) ? priority : 'média',
      assignee: str(payload, 'assignee') || asset.responsibleTeam || 'Plantão manutenção',
      dueDate: dueDate || new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      status: 'pendente',
      description: [str(payload, 'description'), str(payload, 'evidence')].filter(Boolean).join('\n\n'),
      origin: 'estrategia',
    })
    return {
      status: 'confirmed',
      result: { sent: true, maintenanceId: order.id, workOrderId: order.id, message: `Ordem de serviço ${order.id} criada.` },
      linkedEntity: order.id,
    }
  }

  if (action.actionType === 'contingency_plan') {
    const version = (await latestContingencyVersion(db, action.protocol)) + 1
    const plan = await insertContingencyPlan(db, {
      protocol: action.protocol,
      title: str(payload, 'event') || action.title,
      version,
      status: 'aprovado',
      body: {
        risks: str(payload, 'risks'),
        measures: str(payload, 'measures'),
        resources: str(payload, 'resources'),
        owners: str(payload, 'owners'),
        schedule: str(payload, 'schedule'),
        activationCriteria: str(payload, 'activationCriteria'),
        region: action.region,
        justification: action.justification,
      },
    })
    return {
      status: 'confirmed',
      result: {
        sent: true,
        planId: plan.id,
        version: plan.version,
        message: `Plano ${action.protocol} gravado na versão ${plan.version}.`,
      },
      linkedEntity: `${action.protocol}#v${plan.version}`,
    }
  }

  if (action.actionType === 'mobilize_teams') {
    const teams = await listTeams(db)
    const ids = strList(payload, 'teamIds')
    const proposal = proposeTeamRedistribution(teams, action.region, ids)
    payload.redistributionComputed = proposal.lines
    payload.estimatedImpact = proposal.estimatedImpact
  }

  const creds = await loadPrometheusCredentials(db)
  const url = entry.channelEnv ? creds.channels[entry.channelEnv]?.trim() || process.env[entry.channelEnv]?.trim() : ''
  if (!url) {
    return {
      status: 'blocked_no_integration',
      result: {
        sent: false,
        message:
          'Canal de comunicação não configurado. A ação permanece registrada, sem envio efetivo e sem afirmar execução externa.',
        channelEnv: entry.channelEnv,
      },
    }
  }

  const posted = await postWebhook(url, {
    protocol: action.protocol,
    actionType: action.actionType,
    title: action.title,
    region: action.region,
    justification: action.justification,
    payload: action.payload,
    actor: db.actor?.email ?? null,
    requestedAt: new Date().toISOString(),
  })
  if (!posted.ok) {
    return {
      status: 'failed',
      result: {
        sent: false,
        httpStatus: posted.status,
        message: `Falha ao enviar pela integração (${posted.status || 'rede'}). ${posted.bodyPreview}`,
      },
    }
  }
  const confirmed = /confirm/i.test(posted.bodyPreview)
  return {
    status: confirmed ? 'confirmed' : 'sent',
    result: {
      sent: true,
      httpStatus: posted.status,
      confirmed,
      message: confirmed
        ? 'Integração aceitou e confirmou o envio.'
        : 'Mensagem enviada pela integração. Confirmação do destinatário ainda não registrada.',
    },
  }
}

export async function approveAndExecute(db: FogoDb, protocol: string): Promise<StrategicActionRecord> {
  const action = await getStrategicAction(db, protocol)
  if (!action) throw new ActionError('NOT_FOUND', 'Ação não encontrada.')
  if (!['draft', 'pending_approval', 'approved', 'blocked_no_integration', 'failed'].includes(action.status)) {
    throw new ActionError('INVALID_STATE', 'Esta ação não pode ser executada no estado atual.')
  }
  const errors = validateActionPayload(action.actionType, action.payload)
  if (errors.length) throw new ActionError('VALIDATION', errors.join(' '))

  const actor = db.actor?.displayName ?? db.actor?.email ?? 'operador'
  let current = await updateStrategicAction(db, protocol, {
    status: 'approved',
    approvedBy: actor,
    approvedAt: new Date().toISOString(),
  })
  await insertActionEvent(db, current.id, 'approved')

  current = await updateStrategicAction(db, protocol, { status: 'executing' })
  await insertActionEvent(db, current.id, 'executing')

  const outcome = await executeInternal(db, { ...action, payload: current.payload })
  const updated = await updateStrategicAction(db, protocol, {
    status: outcome.status,
    executedAt: new Date().toISOString(),
    executionResult: outcome.result,
    linkedEntity: outcome.linkedEntity ?? null,
    payload: current.payload,
  })
  await insertActionEvent(db, updated.id, 'execution_result', { status: outcome.status, ...outcome.result })
  return getStrategicAction(db, protocol) ?? updated
}
