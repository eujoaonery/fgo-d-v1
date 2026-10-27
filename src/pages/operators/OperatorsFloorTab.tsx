import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Badge, priorityVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AlertKpiStrip } from '@/components/alerts/AlertKpiStrip'
import { useNow } from '@/hooks/useNow'
import { fetchCcoFloor, type CcoFloorResponse } from '@/lib/api'
import { formatDurationMs } from '@/lib/format'
import { userInitials } from '@/lib/userDisplay'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { isAlertPending, operatorAlertKpis } from '@/lib/operatorAlertStats'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { formatSlaPercent, slaTone } from '@/lib/categorySla'
import { cn } from '@/lib/cn'
import { alertHeadline } from '@/lib/alertCopy'

export function OperatorsFloorTab({ apiConnected }: { apiConnected: boolean }) {
  const { apiStatus, alerts, incidents } = useOpsData()
  const { region } = useOpsFilter()
  const { profile } = useCcoAuth()
  const href = useCityHref()
  const now = useNow(1000)
  const [floor, setFloor] = useState<CcoFloorResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    try {
      setFloor(await fetchCcoFloor())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o plantão')
    } finally {
      setLoading(false)
    }
  }, [apiConnected])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 5000)
    return () => clearInterval(t)
  }, [load])

  const meId = profile?.actor?.userId
  const scopedAlerts = useMemo(
    () => (region ? alerts.filter((a) => a.region === region) : alerts),
    [alerts, region],
  )
  const kpis = useMemo(
    () => operatorAlertKpis(scopedAlerts, incidents, meId),
    [scopedAlerts, incidents, meId],
  )

  const slaRows = useMemo(() => {
    const rows = floor?.sla.alerts ?? []
    return [...rows].sort((a, b) => {
      if ((a.slaPercent ?? 0) !== (b.slaPercent ?? 0)) return (a.slaPercent ?? 0) - (b.slaPercent ?? 0)
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    })
  }, [floor])

  if (apiStatus === 'offline') {
    return <p className="text-sm text-fogo-warning">API offline — plantão indisponível.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fogo-border pb-3">
        <div>
          <h2 className="text-lg font-semibold text-fogo-text">Expediente do CCO</h2>
          <p className="mt-0.5 max-w-xl text-sm text-fogo-muted">
            Quem está em expediente (online no painel) e quem está fora. Assumidos e solucionados são do operador logado
            nos cards; cada linha mostra o painel daquele operador.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </div>

      {error ? <p className="text-sm text-fogo-critical">{error}</p> : null}

      <OpsRegionFilterBar />
      <AlertKpiStrip
        values={{
          total: kpis.total,
          pending: kpis.pending,
          resolved: kpis.resolved,
          assumed: kpis.assumed,
          solved: kpis.solved,
        }}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-border sm:grid-cols-3">
        <Stat label="Em expediente" value={floor?.counts.monitoring ?? '—'} tone="live" />
        <Stat label="Fora de expediente" value={floor?.counts.offline ?? '—'} />
        <Stat label="Ocupados" value={floor?.counts.occupied ?? '—'} tone="busy" />
      </div>

      <div className={cn('grid gap-4', floor?.showSla ? 'xl:grid-cols-[minmax(280px,420px)_1fr]' : '')}>
        <OpsPanel
          title="Operadores"
          subtitle="Em expediente = sessão ao vivo. Assumidos e solucionados usam a mesma conta da grade de alertas, na região filtrada."
        >
          <ul className="divide-y divide-fogo-border">
            {(floor?.operators ?? []).length === 0 ? (
              <li className="px-3 py-6 text-sm text-fogo-muted">Nenhum operador da central cadastrado.</li>
            ) : (
              floor!.operators.map((op) => {
                const row = operatorAlertKpis(scopedAlerts, incidents, op.userId)
                const claimed = scopedAlerts.filter((a) => a.claimedBy === op.userId && isAlertPending(a.state))
                return (
                <li key={op.userId} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                      op.monitoring ? 'bg-fogo-success shadow-[0_0_0_3px_rgb(22_163_74_/_0.2)]' : 'bg-fogo-border',
                    )}
                    aria-hidden
                  />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fogo-bg text-[11px] font-semibold text-fogo-muted">
                    {userInitials(op.displayName, op.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-fogo-text">{op.displayName}</p>
                      <Badge variant={op.monitoring ? 'success' : 'neutral'}>
                        {op.monitoring ? 'Em expediente' : 'Fora de expediente'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-fogo-muted">
                      {op.roleLabel}
                      {op.monitoring ? ' · online no painel' : ' · sem sessão'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                      <span className="text-fogo-text">
                        Assumidos <strong className="font-mono">{row.assumed}</strong>
                      </span>
                      <span className="text-fogo-text">
                        Solucionados <strong className="font-mono">{row.solved}</strong>
                      </span>
                    </div>
                    {claimed.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {claimed.map((a) => (
                          <li key={a.id} className="truncate text-[11px] text-fogo-text">
                            {a.id} — {alertHeadline(a.title)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
                )
              })
            )}
          </ul>
        </OpsPanel>

        {floor?.showSla ? (
          <OpsPanel
            title="SLA por categoria"
            subtitle="Percentual da janela alerta → conclusão da OS ou resolução sem OS. 100% até o último minuto."
            action={
              <Link to={href(ROUTES.alerts)} className="text-xs text-fogo-accent hover:underline">
                Abrir alertas
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-fogo-bg/70 text-left text-xs text-fogo-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Alerta</th>
                    <th className="px-3 py-2 font-medium">Operador</th>
                    <th className="px-3 py-2 font-medium">Tempo</th>
                    <th className="px-3 py-2 font-medium">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {slaRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-fogo-muted">
                        Sem alertas para medir SLA.
                      </td>
                    </tr>
                  ) : (
                    slaRows.map((row) => {
                      const elapsed =
                        row.elapsedMs ??
                        Math.max(0, now - new Date(row.detectedAt).getTime())
                      const percent = row.slaPercent ?? 100
                      const tone = slaTone(percent)
                      return (
                        <tr key={row.protocol} className="border-t border-fogo-border align-top">
                          <td className="px-3 py-2">
                            <p className="font-medium text-fogo-text">{alertHeadline(row.title)}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-fogo-accent">{row.protocol}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge variant="neutral">{row.category ?? '—'}</Badge>
                              <Badge variant={priorityVariant(row.severity === 'informativa' ? 'baixa' : row.severity)}>
                                {row.severity}
                              </Badge>
                              <Badge variant="neutral">{row.state}</Badge>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">{row.claimedByLabel ?? '—'}</td>
                          <td className="px-3 py-2 text-xs tabular-nums">{formatDurationMs(elapsed)}</td>
                          <td
                            className={cn(
                              'px-3 py-2 text-xs font-medium tabular-nums',
                              tone === 'critical' && 'text-fogo-critical',
                              tone === 'warn' && 'text-fogo-warning',
                              tone === 'ok' && 'text-fogo-success',
                            )}
                          >
                            {formatSlaPercent(percent)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </OpsPanel>
        ) : null}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'live' | 'busy' | 'alert'
}) {
  return (
    <div className="bg-fogo-surface px-4 py-3">
      <p className="text-xs text-fogo-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-2xl font-semibold tabular-nums',
          tone === 'live' && 'text-fogo-success',
          tone === 'busy' && 'text-fogo-warning',
          tone === 'alert' && 'text-fogo-critical',
          !tone && 'text-fogo-text',
        )}
      >
        {value}
      </p>
    </div>
  )
}
