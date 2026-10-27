import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { fetchSystemLogs, type SystemLogRecord } from '@/lib/api'
import {
  LOG_CATEGORIES,
  LOG_LEVELS,
  formatLogMetadata,
  logCategoryLabel,
  logLevelLabel,
  type SystemLogCategory,
  type SystemLogLevel,
} from '@/lib/logLabels'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

function levelBadgeClass(level: SystemLogLevel): string {
  switch (level) {
    case 'error':
      return 'bg-fogo-critical-bg text-fogo-critical border-fogo-critical/35'
    case 'warn':
      return 'bg-fogo-warning-bg text-fogo-warning border-fogo-warning/35'
    default:
      return 'bg-fogo-bg text-fogo-muted border-fogo-border/80'
  }
}

export function OperatorsLogsTab({ apiConnected }: { apiConnected: boolean }) {
  const [logs, setLogs] = useState<SystemLogRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<SystemLogLevel | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<SystemLogCategory | ''>('')

  const load = useCallback(async () => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    try {
      setLogs(
        await fetchSystemLogs({
          limit: 200,
          level: levelFilter || undefined,
          category: categoryFilter || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar logs')
    } finally {
      setLoading(false)
    }
  }, [apiConnected, levelFilter, categoryFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <OpsPanel
      flow
      title="Logs do sistema"
      subtitle="Autenticação, requisições à API, erros e eventos técnicos (system_logs). Distinto da auditoria de negócio."
      action={
        <Button variant="ghost" size="sm" disabled={!apiConnected || loading} onClick={() => void load()}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {error ? <p className="text-sm text-fogo-warning">{error}</p> : null}

        <div className="flex flex-wrap gap-3 text-xs text-fogo-muted">
          <label className="flex items-center gap-2">
            Nível
            <select
              className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text"
              value={levelFilter}
              onChange={(e) => setLevelFilter((e.target.value || '') as SystemLogLevel | '')}
            >
              <option value="">Todos</option>
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {logLevelLabel(l)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Categoria
            <select
              className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter((e.target.value || '') as SystemLogCategory | '')}
            >
              <option value="">Todas</option>
              {LOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {logCategoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-fogo-md border border-fogo-border/80">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-fogo-bg/60 text-fogo-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Nível</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Mensagem</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fogo-border/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-fogo-muted">
                    Carregando…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-fogo-muted">
                    Nenhum log registrado ainda. Eventos aparecem após login, chamadas à API e erros.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="text-fogo-text">
                    <td className="whitespace-nowrap px-3 py-2 text-fogo-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-block rounded-fogo-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase',
                          levelBadgeClass(row.level),
                        )}
                      >
                        {logLevelLabel(row.level)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{logCategoryLabel(row.category)}</td>
                    <td className="max-w-[220px] px-3 py-2 font-medium">{row.message}</td>
                    <td className="px-3 py-2 text-fogo-muted">{row.actorEmail ?? '—'}</td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-fogo-muted" title={formatLogMetadata(row.metadata)}>
                      {formatLogMetadata(row.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OpsPanel>
  )
}
