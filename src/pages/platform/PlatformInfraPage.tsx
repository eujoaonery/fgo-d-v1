import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Badge } from '@/components/ui/Badge'
import { useChartTheme } from '@/lib/chartTheme'
import { cn } from '@/lib/cn'
import { formatDateTimePtBr } from '@/lib/format'
import {
  fetchPlatformInfra,
  type InfraAccessEntry,
  type InfraHostSample,
  type InfraTrafficEntry,
  type PlatformInfraSnapshot,
} from '@/lib/tenantApi'

type HistoryRange = 'live' | 'hour' | 'day' | 'week'

type ReqFilter = 'all' | 'fogo' | 'db' | 'ext'

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  const digits = v >= 10 || i === 0 ? 0 : 1
  return `${v.toFixed(digits)} ${units[i]}`
}

function formatUptime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function tone(percent: number) {
  if (percent >= 85) return 'critical' as const
  if (percent >= 70) return 'warning' as const
  return 'ok' as const
}

function toneClass(t: ReturnType<typeof tone>) {
  if (t === 'critical') return 'text-fogo-critical'
  if (t === 'warning') return 'text-fogo-warning'
  return 'text-fogo-success'
}

function barClass(t: ReturnType<typeof tone>) {
  if (t === 'critical') return 'bg-fogo-critical'
  if (t === 'warning') return 'bg-fogo-warning'
  return 'bg-fogo-accent'
}

function Sparkline({ values, tone: t }: { values: number[]; tone: ReturnType<typeof tone> }) {
  if (values.length < 2) {
    return <div className="h-8" />
  }
  const w = 160
  const h = 32
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 100)
  const span = Math.max(1, max - min)
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 2) - 1
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const stroke = t === 'critical' ? 'var(--fogo-critical)' : t === 'warning' ? 'var(--fogo-warning)' : 'var(--fogo-accent)'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ResourceTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-fogo-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-fogo-text" title={value}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-fogo-muted">{hint}</p> : null}
    </div>
  )
}

function pickHistory(data: PlatformInfraSnapshot | null, range: HistoryRange): InfraHostSample[] {
  if (!data) return []
  if (range === 'live') return data.series ?? []
  if (range === 'hour') return data.historyHour?.length ? data.historyHour : data.series
  if (range === 'day') return data.historyDay?.length ? data.historyDay : data.historyHour ?? data.series
  return data.historyWeek?.length ? data.historyWeek : data.historyDay ?? data.series
}

/** O fim do gráfico é a mesma amostra dos cartões, não o último minuto ou hora já gravados. */
function seriesEndingNow(samples: InfraHostSample[], current: InfraHostSample | null): InfraHostSample[] {
  if (!current) return samples
  const last = samples[samples.length - 1]
  if (!last || last.at === current.at) return last ? samples : [current]
  if (Date.parse(current.at) >= Date.parse(last.at)) return [...samples, current]
  return samples
}

function tickLabel(iso: string, range: HistoryRange) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (range === 'week') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  if (range === 'day') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: range === 'live' ? '2-digit' : undefined })
}

function HistoryChart({
  title,
  samples,
  range,
  valueKey,
  color,
  now,
}: {
  title: string
  samples: InfraHostSample[]
  range: HistoryRange
  valueKey: 'cpuPercent' | 'memPercent'
  color: string
  now?: number
}) {
  const chart = useChartTheme()
  const points = samples.map((s) => ({
    at: s.at,
    label: tickLabel(s.at, range),
    value: s[valueKey],
  }))
  const latest = now ?? points[points.length - 1]?.value ?? 0
  const peak = points.reduce((m, p) => Math.max(m, p.value), 0)
  const avg = points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0

  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-fogo-muted">{title}</p>
        <p className="font-mono text-sm tabular-nums text-fogo-text">{latest.toFixed(1)}% agora</p>
      </div>
      <p className="mt-0.5 text-[11px] text-fogo-muted">
        média {avg.toFixed(1)}% · pico {peak.toFixed(1)}%
      </p>
      <div className="mt-2 h-44">
        {points.length < 2 ? (
          <p className="flex h-full items-center text-xs text-fogo-muted">Ainda sem histórico suficiente neste recorte.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id={`fill-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={chart.tick}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={chart.tooltip}
                formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, title]}
                labelFormatter={(_, payload) => {
                  const iso = payload?.[0]?.payload?.at as string | undefined
                  return iso ? formatDateTimePtBr(iso) : ''
                }}
              />
              <Area type="monotone" dataKey="value" stroke={color} fill={`url(#fill-${valueKey})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Gauge({
  label,
  percent,
  detail,
  series,
}: {
  label: string
  percent: number
  detail: string
  series: number[]
}) {
  const t = tone(percent)
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-fogo-muted">{label}</p>
        <p className={cn('font-mono text-2xl font-semibold tabular-nums tracking-tight', toneClass(t))}>
          {percent.toFixed(1)}%
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fogo-bg">
        <div className={cn('h-full rounded-full', barClass(t))} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-fogo-muted">{detail}</p>
      <div className="mt-1 opacity-80">
        <Sparkline values={series} tone={t} />
      </div>
    </div>
  )
}

function targetLabel(t: InfraTrafficEntry['target']) {
  switch (t) {
    case 'fogo-api':
      return 'FOGO'
    case 'supabase':
      return 'Banco'
    case 'openai':
      return 'OpenAI'
    case 'turnstile':
      return 'Turnstile'
    case 'weather':
      return 'Clima'
    case 'osm':
      return 'OSM'
    default:
      return 'Externa'
  }
}

function accessLabel(event: string) {
  switch (event) {
    case 'login':
      return 'Login'
    case 'login_failed':
      return 'Falha'
    case 'logout':
      return 'Saída'
    case 'session_restored':
      return 'Sessão'
    case 'reauth':
      return 'Reautenticação'
    default:
      return event
  }
}

function statusVariant(status: number): 'success' | 'warning' | 'critical' | 'neutral' {
  if (status >= 500 || status === 0) return 'critical'
  if (status >= 400) return 'warning'
  if (status >= 200 && status < 300) return 'success'
  return 'neutral'
}

function platformLabel(p: string) {
  if (p === 'linux') return 'Linux'
  if (p === 'win32') return 'Windows'
  return p
}

export function PlatformInfraPage() {
  const chart = useChartTheme()
  const [data, setData] = useState<PlatformInfraSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reqFilter, setReqFilter] = useState<ReqFilter>('all')
  const [range, setRange] = useState<HistoryRange>('hour')

  const load = useCallback(async () => {
    try {
      const next = await fetchPlatformInfra()
      setData(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler a infraestrutura')
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(id)
  }, [load])

  const requests = useMemo(() => {
    if (!data) return [] as InfraTrafficEntry[]
    const merged = [...data.inbound, ...data.outbound].sort((a, b) => b.at.localeCompare(a.at))
    return merged.filter((row) => {
      if (reqFilter === 'fogo') return row.direction === 'inbound'
      if (reqFilter === 'db') return row.target === 'supabase'
      if (reqFilter === 'ext') return row.direction === 'outbound' && row.target !== 'supabase'
      return true
    })
  }, [data, reqFilter])

  const current: InfraHostSample | null = data?.current ?? null
  const history = seriesEndingNow(pickHistory(data, range), current)

  if (!data && !error) return <LoadScreen full={false} />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-fogo-text">Infraestrutura</h1>
        <p className="text-sm text-fogo-muted">Maquina virtual na qual a aplicação esta rodando</p>
      </div>

      {error ? <p className="text-sm text-fogo-warning">{error}</p> : null}

      <section className="overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-fogo-card">
        <div className="border-b border-fogo-border px-4 py-3">
          <p className="text-sm font-medium text-fogo-text">Recursos da VM</p>
          <p className="text-[11px] text-fogo-muted">Inventário lido do host onde a API está rodando. Atualiza após reboot de CPU/RAM.</p>
        </div>
        <div className="grid divide-y divide-fogo-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
          <ResourceTile
            label="Processador"
            value={data ? `${data.host.cpus} vCPU` : '—'}
            hint={data?.host.cpuModel}
          />
          <ResourceTile
            label="Memória"
            value={formatBytes(data?.host.memTotalBytes ?? current?.memTotalBytes ?? 0)}
            hint={current ? `${formatBytes(current.memUsedBytes)} em uso` : undefined}
          />
          <ResourceTile
            label="Disco"
            value={formatBytes(data?.host.diskTotalBytes ?? current?.diskTotalBytes ?? 0)}
            hint={current ? `${formatBytes(current.diskUsedBytes)} ocupados` : undefined}
          />
          <ResourceTile
            label="Sistema"
            value={data?.host.osPretty || (data ? `${platformLabel(data.host.platform)}` : '—')}
            hint={data ? `${platformLabel(data.host.platform)} ${data.host.arch}` : undefined}
          />
          <ResourceTile
            label="Uptime"
            value={current ? formatUptime(current.uptimeSec) : '—'}
            hint="desde o último boot"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-fogo-card">
        <div className="grid divide-y divide-fogo-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Gauge
            label="CPU"
            percent={current?.cpuPercent ?? 0}
            detail={current ? `carga 1 min ${current.load1.toFixed(2)}` : 'aguardando amostra'}
            series={(data?.series ?? []).map((s) => s.cpuPercent)}
          />
          <Gauge
            label="Memória"
            percent={current?.memPercent ?? 0}
            detail={current ? `${formatBytes(current.memUsedBytes)} de ${formatBytes(current.memTotalBytes)}` : 'aguardando amostra'}
            series={(data?.series ?? []).map((s) => s.memPercent)}
          />
          <Gauge
            label="Disco"
            percent={current?.diskPercent ?? 0}
            detail={
              current
                ? `${formatBytes(current.diskUsedBytes)} de ${formatBytes(current.diskTotalBytes)}`
                : 'aguardando amostra'
            }
            series={(data?.series ?? []).map((s) => s.diskPercent)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-fogo-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fogo-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fogo-text">Histórico de consumo</p>
            <p className="text-[11px] text-fogo-muted">
              CPU, memória e disco são da VM inteira. O “agora” é a mesma leitura dos cartões. O traço guarda o recorte: 4s ao vivo, 1 min nas 24h, 1 hora nos 7 dias.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['live', '15 min'],
                ['hour', '1 hora'],
                ['day', '24 horas'],
                ['week', '7 dias'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={cn(
                  'rounded-fogo-sm px-2 py-0.5 text-[11px]',
                  range === id ? 'bg-fogo-accent text-white' : 'text-fogo-muted hover:text-fogo-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid divide-y divide-fogo-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <HistoryChart
            title="CPU"
            samples={history}
            range={range}
            valueKey="cpuPercent"
            color={chart.accent}
            now={current?.cpuPercent}
          />
          <HistoryChart
            title="Memória"
            samples={history}
            range={range}
            valueKey="memPercent"
            color={chart.success}
            now={current?.memPercent}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <OpsPanel
            title="Requisições"
            subtitle="API FOGO, chamadas ao banco e APIs externas. Buffer desde o último arranque."
            action={
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['all', 'Todas'],
                    ['fogo', 'API FOGO'],
                    ['db', 'Banco'],
                    ['ext', 'Externas'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setReqFilter(id)}
                    className={cn(
                      'rounded-fogo-sm px-2 py-0.5 text-[11px]',
                      reqFilter === id ? 'bg-fogo-accent text-white' : 'text-fogo-muted hover:text-fogo-text',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <LogTable
              empty="Nenhuma requisição neste buffer ainda."
              columns={['Quando', 'Destino', 'Método', 'Caminho', 'Status', 'Tempo']}
              rows={requests.slice(0, 120).map((row) => (
                <tr key={`${row.at}-${row.method}-${row.path}-${row.durationMs}`} className="text-fogo-text">
                  <td className="whitespace-nowrap px-3 py-1.5 text-fogo-muted">{formatDateTimePtBr(row.at)}</td>
                  <td className="px-3 py-1.5">{targetLabel(row.target)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{row.method}</td>
                  <td className="max-w-[280px] truncate px-3 py-1.5 font-mono text-[11px]" title={row.path}>
                    {row.path}
                    {row.tenant ? <span className="ml-1 text-fogo-muted">({row.tenant})</span> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={statusVariant(row.status)}>{row.status || 'rede'}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-fogo-muted">{row.durationMs} ms</td>
                </tr>
              ))}
            />
          </OpsPanel>
        </div>

        <div className="xl:col-span-2">
          <OpsPanel title="Tentativas de acesso" subtitle="Login, falhas e saídas na plataforma e nas cidades.">
            <LogTable
              empty="Nenhuma tentativa registrada ainda."
              columns={['Quando', 'Evento', 'Quem', 'IP']}
              rows={(data?.access ?? []).slice(0, 120).map((row: InfraAccessEntry) => (
                <tr key={`${row.at}-${row.event}-${row.email ?? ''}-${row.ip ?? ''}`} className="text-fogo-text">
                  <td className="whitespace-nowrap px-3 py-1.5 text-fogo-muted">{formatDateTimePtBr(row.at)}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={row.event === 'login_failed' ? 'critical' : row.event === 'login' ? 'success' : 'neutral'}>
                      {accessLabel(row.event)}
                    </Badge>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-1.5" title={row.message}>
                    {row.email ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-fogo-muted">{row.ip ?? '—'}</td>
                </tr>
              ))}
            />
          </OpsPanel>
        </div>
      </div>
    </div>
  )
}

function LogTable({
  columns,
  rows,
  empty,
}: {
  columns: string[]
  rows: ReactNode[]
  empty: string
}) {
  return (
    <div className="max-h-[28rem] overflow-auto p-3">
      <div className="overflow-x-auto rounded-fogo-md border border-fogo-border/80">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="sticky top-0 bg-fogo-bg/90 text-fogo-muted">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-fogo-border/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-fogo-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
