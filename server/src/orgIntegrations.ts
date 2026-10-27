import type { FogoDb } from './supabase.js'
import { loadSecrets, saveSecrets } from './connectors/store.js'
import { secretsConfigured } from './connectors/secrets.js'
import { patchOrgSettings } from './tenant/orgs.js'
import { HttpError } from './httpError.js'
import { maskSecretHint, PROMETHEUS_CHANNEL_DEFS } from '../../src/lib/prometheusChannels.js'

const SETTINGS_KEY = 'prometheus'
const DEFAULT_MODEL = 'gpt-4o-mini'

type PrometheusMeta = {
  model?: string
  secretId?: string
}

export type PrometheusCredentials = {
  apiKey: string | null
  model: string
  fromOrg: boolean
  fromEnv: boolean
  channels: Record<string, string>
}

function asMeta(settings: Record<string, unknown> | undefined): PrometheusMeta {
  const raw = settings?.[SETTINGS_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const obj = raw as Record<string, unknown>
  return {
    model: typeof obj.model === 'string' ? obj.model : undefined,
    secretId: typeof obj.secretId === 'string' ? obj.secretId : undefined,
  }
}

export async function loadPrometheusCredentials(db: FogoDb): Promise<PrometheusCredentials> {
  const meta = asMeta(db.tenant?.settings)
  const secrets = meta.secretId ? await loadSecrets(db.supabase, db.orgId, meta.secretId) : {}
  const orgKey = secrets.openaiApiKey?.trim() || ''
  const envKey = process.env.OPENAI_API_KEY?.trim() || ''
  const apiKey = orgKey || envKey || null
  const model =
    (typeof meta.model === 'string' && meta.model.trim()) || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL
  const channels: Record<string, string> = {}
  for (const ch of PROMETHEUS_CHANNEL_DEFS) {
    channels[ch.env] = secrets[ch.secretKey]?.trim() || process.env[ch.env]?.trim() || ''
  }
  return {
    apiKey,
    model,
    fromOrg: Boolean(orgKey),
    fromEnv: Boolean(!orgKey && envKey),
    channels,
  }
}

export async function getPrometheusIntegrationStatus(db: FogoDb) {
  const creds = await loadPrometheusCredentials(db)
  const meta = asMeta(db.tenant?.settings)
  const secrets = meta.secretId ? await loadSecrets(db.supabase, db.orgId, meta.secretId) : {}
  return {
    vaultReady: secretsConfigured(),
    openai: {
      configured: Boolean(creds.apiKey),
      fromOrg: creds.fromOrg,
      fromEnv: creds.fromEnv,
      model: creds.model,
      keyHint: creds.fromOrg ? maskSecretHint(secrets.openaiApiKey) : null,
    },
    channels: PROMETHEUS_CHANNEL_DEFS.map((ch) => {
      const orgVal = secrets[ch.secretKey]?.trim() || ''
      const envVal = process.env[ch.env]?.trim() || ''
      return {
        id: ch.id,
        env: ch.env,
        label: ch.label,
        hint: ch.hint,
        configured: Boolean(orgVal || envVal),
        fromOrg: Boolean(orgVal),
        fromEnv: Boolean(!orgVal && envVal),
      }
    }),
  }
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t.length ? t : undefined
}

export async function savePrometheusIntegration(
  db: FogoDb,
  body: {
    apiKey?: string | null
    clearKey?: boolean
    model?: string
    channels?: Partial<Record<string, string | null>>
  },
) {
  if (!secretsConfigured()) {
    throw new HttpError(
      503,
      'O cofre de credenciais não está disponível neste servidor.',
      'SECRETS_KEY_MISSING',
    )
  }
  const meta = asMeta(db.tenant?.settings)
  const current = meta.secretId ? await loadSecrets(db.supabase, db.orgId, meta.secretId) : {}
  const next: Record<string, string> = { ...current }

  if (body.clearKey) {
    delete next.openaiApiKey
  } else {
    const key = cleanOptional(body.apiKey)
    if (key) next.openaiApiKey = key
  }

  if (body.channels) {
    for (const ch of PROMETHEUS_CHANNEL_DEFS) {
      if (!(ch.id in body.channels) && !(ch.env in body.channels)) continue
      const raw = body.channels[ch.id] ?? body.channels[ch.env]
      if (raw === null || raw === '') {
        delete next[ch.secretKey]
      } else {
        const url = cleanOptional(raw)
        if (url) next[ch.secretKey] = url
      }
    }
  }

  const secretId =
    Object.keys(next).length > 0 ? await saveSecrets(db.supabase, db.orgId, meta.secretId ?? null, next) : meta.secretId

  const model = cleanOptional(body.model) || meta.model || DEFAULT_MODEL
  const tenant = await patchOrgSettings(db.supabase, db.orgId, {
    [SETTINGS_KEY]: { model, secretId: secretId ?? null },
  })
  db.tenant = tenant
  return getPrometheusIntegrationStatus(db)
}

export async function testOpenAiKey(apiKey: string, model?: string): Promise<{ ok: boolean; model: string; error?: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, model: model || DEFAULT_MODEL, error: 'Informe a chave da OpenAI.' }
  const chosen = model?.trim() || DEFAULT_MODEL
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12_000)
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      signal: ac.signal,
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        model: chosen,
        error: res.status === 401 ? 'Chave recusada pela OpenAI.' : `OpenAI HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
      }
    }
    return { ok: true, model: chosen }
  } catch (e) {
    return {
      ok: false,
      model: chosen,
      error: e instanceof Error ? e.message : 'Falha ao falar com a OpenAI.',
    }
  } finally {
    clearTimeout(timer)
  }
}
