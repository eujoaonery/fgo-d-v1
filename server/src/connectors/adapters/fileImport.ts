import { createHash } from 'node:crypto'
import type { ConnectorAdapter, ConnectorContext, IngestCandidate } from '../types.js'

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

export function buildFileCandidates(
  payload: unknown,
  fieldMap: Record<string, string> | undefined,
  connectorId: string,
): IngestCandidate[] {
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : typeof payload === 'string'
      ? parseCsv(payload)
      : payload && typeof payload === 'object' && Array.isArray((payload as { records?: unknown[] }).records)
        ? ((payload as { records: unknown[] }).records)
        : payload && typeof payload === 'object'
          ? [payload]
          : []
  const map = fieldMap ?? {}
  return rows.slice(0, 500).map((row, idx) => {
    const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : { value: row }
    const get = (k: string) => {
      const path = map[k]
      if (!path) return rec[k]
      return rec[path] ?? rec[k]
    }
    const raw = JSON.stringify(rec)
    return {
      idempotencyKey: createHash('sha256').update(`${connectorId}:${raw}`).digest('hex').slice(0, 40),
      eventType: 'file.import',
      assetExternalId: get('assetId') != null ? String(get('assetId')) : null,
      occurredAt: get('occurredAt') != null ? String(get('occurredAt')) : new Date().toISOString(),
      payload: rec,
      metric:
        get('metric') != null
          ? {
              name: String(get('metric')),
              value: get('value') == null || get('value') === '' ? null : Number(get('value')),
              unit: get('unit') != null ? String(get('unit')) : null,
            }
          : undefined,
    }
  })
}

export const fileImportAdapter: ConnectorAdapter = {
  kind: 'file_import',
  version: '1',
  async test() {
    return {
      ok: true,
      result: 'mapeamento_pronto',
      detail: { note: 'Envie JSON ou CSV pelo endpoint de execução. Dispositivos desconhecidos não viram ativos.' },
      error: null,
    }
  },
  async execute(ctx: ConnectorContext) {
    const payload = ctx.config.payload
    if (payload == null) {
      return { ok: false, result: 'sem_payload', detail: {}, error: 'Nenhum arquivo ou JSON foi enviado.' }
    }
    const fieldMap =
      ctx.config.fieldMap && typeof ctx.config.fieldMap === 'object'
        ? (ctx.config.fieldMap as Record<string, string>)
        : undefined
    const ingest = buildFileCandidates(payload, fieldMap, ctx.connector.id)
    return {
      ok: ingest.length > 0,
      result: ingest.length ? 'arquivo_lido' : 'arquivo_vazio',
      detail: { rows: ingest.length },
      ingest,
      error: ingest.length ? null : 'Nenhuma linha válida.',
    }
  },
}
