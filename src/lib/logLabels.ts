export type SystemLogLevel = 'info' | 'warn' | 'error'
export type SystemLogCategory = 'auth' | 'http' | 'ops' | 'system'

export const LOG_LEVELS: SystemLogLevel[] = ['info', 'warn', 'error']
export const LOG_CATEGORIES: SystemLogCategory[] = ['auth', 'http', 'ops', 'system']

export function logLevelLabel(level: SystemLogLevel): string {
  switch (level) {
    case 'info':
      return 'Info'
    case 'warn':
      return 'Aviso'
    case 'error':
      return 'Erro'
  }
}

export function logCategoryLabel(category: SystemLogCategory): string {
  switch (category) {
    case 'auth':
      return 'Autenticação'
    case 'http':
      return 'Requisições API'
    case 'ops':
      return 'Operações'
    case 'system':
      return 'Sistema'
  }
}

export function formatLogMetadata(metadata: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof metadata.method === 'string' && typeof metadata.status === 'number') {
    parts.push(`${metadata.method} → ${metadata.status}`)
  }
  if (typeof metadata.durationMs === 'number') {
    parts.push(`${metadata.durationMs} ms`)
  }
  if (typeof metadata.email === 'string' && metadata.email) {
    parts.push(metadata.email)
  }
  if (typeof metadata.error === 'string' && metadata.error) {
    parts.push(metadata.error)
  }
  if (typeof metadata.event === 'string') {
    parts.push(String(metadata.event))
  }
  if (parts.length) return parts.join(' · ')
  const raw = JSON.stringify(metadata)
  return raw === '{}' ? '—' : raw.length > 120 ? `${raw.slice(0, 117)}…` : raw
}
