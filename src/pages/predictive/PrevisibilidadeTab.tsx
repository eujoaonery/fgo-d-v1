import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ChartCard } from '@/components/charts/ChartCard'
import { fetchPrevisibilidade, runPrevisibilidadePrometheus, type PrometheusPrevisibilidade } from '@/lib/api'
import { useChartTheme } from '@/lib/chartTheme'
import { useOpsData } from '@/context/OpsDataContext'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'

const TONE: Record<string, string> = {
  warning: 'border-fogo-warning/40',
  critical: 'border-fogo-critical/40',
  neutral: 'border-fogo-border',
}

export function PrevisibilidadeTab() {
  const chart = useChartTheme()
  const href = useCityHref()
  const { apiConnected } = useOpsData()
  const [data, setData] = useState<PrometheusPrevisibilidade | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!apiConnected) return
    setLoading(true)
    setError(null)
    void fetchPrevisibilidade()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar previsibilidade'))
      .finally(() => setLoading(false))
  }, [apiConnected])

  useEffect(() => {
    load()
  }, [load])

  async function askPrometheus() {
    setBusy(true)
    setError(null)
    try {
      setData(await runPrevisibilidadePrometheus())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no PROMETHEUS')
    } finally {
      setBusy(false)
    }
  }

  const pieColors = [chart.accent, chart.success, chart.critical, '#d97706', chart.mutedLine, '#8b5cf6']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Previsibilidade · PROMETHEUS</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-fogo-muted">
            Gráficos saem dos dados operacionais. O PROMETHEUS só comenta números já calculados — não inventa MAE,
            RMSE nem probabilidade.
          </p>
        </div>
        <Button size="sm" onClick={() => void askPrometheus()} disabled={busy || !apiConnected}>
          {busy ? 'Consultando…' : 'Pedir leitura do PROMETHEUS'}
        </Button>
      </div>

      {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}
      {loading && !data ? <p className="text-xs text-fogo-muted">Montando recorte…</p> : null}

      {data?.unavailableReason ? (
        <Card className="border-fogo-warning/40 p-3 text-xs text-fogo-muted">
          {data.unavailableReason}{' '}
          <Link className="text-fogo-accent underline-offset-2 hover:underline" to={href(ROUTES.integrations)}>
            Abrir Integrações
          </Link>
        </Card>
      ) : null}

      {data?.headline ? (
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-fogo-muted">
            {data.model} · {data.generatedAt ? formatDateTime(data.generatedAt) : ''}
          </p>
          <p className="mt-1 text-sm font-medium">{data.headline}</p>
        </Card>
      ) : null}

      {data?.feedbacks.length ? (
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.feedbacks.map((f) => (
            <li key={f.title} className={cn('rounded-fogo-md border bg-fogo-surface p-3', TONE[f.tone] ?? TONE.neutral)}>
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-fogo-muted">{f.body}</p>
              <p className="mt-1 text-[10px] text-fogo-muted">Com base em {f.basedOn}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {data?.priorities.length ? (
        <Card className="p-4">
          <h4 className="text-sm font-semibold">Prioridades apontadas</h4>
          <ul className="mt-2 space-y-2">
            {data.priorities.map((p) => (
              <li key={p.title} className="text-xs">
                <p className="font-medium">{p.title}</p>
                <p className="text-fogo-muted">{p.why}</p>
                <p className="text-[10px] text-fogo-muted">Horizonte {p.horizon}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Disponibilidade" value={data ? `${data.availability.percent}%` : '—'} hint="exclui não instalado/baixado" />
        <Stat label="MAE" value={data?.metrics.mae != null ? String(data.metrics.mae) : '—'} />
        <Stat label="RMSE" value={data?.metrics.rmse != null ? String(data.metrics.rmse) : '—'} />
        <Stat label="Previsões pendentes" value={String(data?.metrics.pending ?? '—')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Alertas abertos por gravidade">
          <MiniBar data={data?.charts.alertsBySeverity ?? []} chart={chart} />
        </ChartCard>
        <ChartCard title="Cadastro dos ativos">
          {(data?.charts.cadastralMix.length ?? 0) === 0 ? (
            <p className="p-4 text-xs text-fogo-muted">Sem inventário.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data!.charts.cadastralMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {data!.charts.cadastralMix.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chart.tooltip} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Agentes por estado operacional">
          <MiniBar data={data?.charts.agentsByStatus ?? []} chart={chart} />
        </ChartCard>
        <ChartCard title="Carga por região" description="Alertas abertos e ativos">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.charts.regionLoad ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="region" tick={{ ...chart.tick, fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={48} />
              <YAxis tick={chart.tick} allowDecimals={false} />
              <Tooltip contentStyle={chart.tooltip} />
              <Legend />
              <Bar dataKey="alerts" name="Alertas" fill={chart.critical} radius={[4, 4, 0, 0]} />
              <Bar dataKey="assets" name="Ativos" fill={chart.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Ciclo das recomendações">
          <MiniBar data={data?.charts.decisions ?? []} chart={chart} />
        </ChartCard>
      </div>

      {data?.limitations.length ? (
        <ul className="space-y-1 text-[11px] text-fogo-muted">
          {data.limitations.map((l) => (
            <li key={l}>— {l}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function MiniBar({
  data,
  chart,
}: {
  data: { name: string; value: number }[]
  chart: ReturnType<typeof useChartTheme>
}) {
  if (!data.length) return <p className="p-4 text-xs text-fogo-muted">Sem dados neste recorte.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
        <XAxis dataKey="name" tick={{ ...chart.tick, fontSize: 10 }} interval={0} angle={-16} textAnchor="end" height={48} />
        <YAxis tick={chart.tick} allowDecimals={false} />
        <Tooltip contentStyle={chart.tooltip} />
        <Bar dataKey="value" fill={chart.accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-[10px] text-fogo-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-fogo-muted">{hint}</p> : null}
    </Card>
  )
}
