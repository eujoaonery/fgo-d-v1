import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { fetchAuditLogs, type AuditLogRecord } from '@/lib/api'
import { AUDIT_ACTION_CODES, auditActionLabel, formatAuditDetail } from '@/lib/auditLabels'
import { formatDateTime } from '@/lib/format'

export function OperatorsAuditTab({ apiConnected }: { apiConnected: boolean }) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const load = useCallback(async () => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    try {
      setLogs(
        await fetchAuditLogs({
          limit: 200,
          action: actionFilter || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar auditoria')
    } finally {
      setLoading(false)
    }
  }, [apiConnected, actionFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <OpsPanel
      flow
      title="Auditoria"
      subtitle="Registro de ações de usuários e alterações relevantes no CCO (audit_log)."
      action={
        <Button variant="ghost" size="sm" disabled={!apiConnected || loading} onClick={() => void load()}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {error ? <p className="text-sm text-fogo-warning">{error}</p> : null}

        <div className="text-xs text-fogo-muted">
          <p className="mb-1">Filtrar por ação</p>
          <button
            type="button"
            className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            {actionFilter ? auditActionLabel(actionFilter) : 'Todas'}
          </button>
          {filterOpen ? (
            <ul className="mt-2 max-h-52 overflow-y-auto rounded-fogo-md border border-fogo-border bg-fogo-surface py-1">
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm text-fogo-text hover:bg-fogo-bg"
                  onClick={() => {
                    setActionFilter('')
                    setFilterOpen(false)
                  }}
                >
                  Todas
                </button>
              </li>
              {AUDIT_ACTION_CODES.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm text-fogo-text hover:bg-fogo-bg"
                    onClick={() => {
                      setActionFilter(code)
                      setFilterOpen(false)
                    }}
                  >
                    {auditActionLabel(code)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-fogo-md border border-fogo-border/80">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-fogo-bg/60 text-fogo-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Quem</th>
                <th className="px-3 py-2 font-medium">Ação</th>
                <th className="px-3 py-2 font-medium">Entidade</th>
                <th className="px-3 py-2 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fogo-border/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-fogo-muted">
                    Carregando…
                  </td>
                </tr>
              ) : null}
              {!loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-fogo-muted">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : null}
              {logs.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fogo-muted">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-fogo-text">{row.actorEmail ?? row.actorId ?? 'Sistema'}</td>
                  <td className="px-3 py-2 font-medium text-fogo-text">{auditActionLabel(row.action)}</td>
                  <td className="px-3 py-2 text-fogo-muted">{row.entityType}</td>
                  <td className="max-w-xs px-3 py-2 text-fogo-text">{formatAuditDetail(row.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </OpsPanel>
  )
}
