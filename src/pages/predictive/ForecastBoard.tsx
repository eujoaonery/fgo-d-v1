import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PredictiveAccuracyPair, PredictiveHistoryDay, PredictiveHitPoint, PredictiveHorizonSkill, PredictiveHourForecast, PredictiveSummary } from '@/lib/api'
import { useOpsData } from '@/context/OpsDataContext'
import { useChartTheme } from '@/lib/chartTheme'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

function fmtCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n % 1 === 0 ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function dayNumber(iso: string): string {
  return iso.slice(8, 10)
}

export function ForecastBoard({ summary, loading }: { summary: PredictiveSummary | null; loading: boolean }) {
  const { alerts } = useOpsData()
  const days = summary?.upcomingDays ?? []
  const [selected, setSelected] = useState(0)
  const chosen = days[selected] ?? days[0]
  const openAlerts = alerts.filter((a) => a.state !== 'resolvido' && a.state !== 'falso positivo' && a.state !== 'os_aberta').length

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {summary?.insufficientHistory ? (
        <p className="rounded-fogo-md border border-fogo-warning/40 bg-fogo-warning-bg px-3 py-2 text-sm text-fogo-warning">
          Ainda há pouco histórico ({summary.observationCount ?? 0} alertas). Os números só aparecem depois de{' '}
          {summary.minObservations ?? 50} registros.
        </p>
      ) : null}

      {loading && !summary ? <p className="text-sm text-fogo-muted">Carregando previsões…</p> : null}

      <HourlyAlertBoard hours={summary?.upcomingHours ?? []} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
      <div className="min-w-0 space-y-8">
      <section>
        <p className="text-sm text-fogo-muted">Alertas esperados</p>
        <div className="fogo-scroll-subtle mt-3 flex gap-1 overflow-x-auto overflow-y-hidden pb-1">
          {days.map((day, index) => {
            const active = chosen?.date === day.date
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelected(index)}
                className={cn(
                  'flex min-w-[4.4rem] flex-col items-center rounded-fogo-md border px-2 py-2 transition-colors duration-200',
                  active
                    ? 'border-fogo-accent bg-fogo-accent text-white'
                    : 'border-fogo-border bg-fogo-surface text-fogo-text hover:border-fogo-accent/50',
                )}
              >
                <span className="text-[10px] opacity-80">{day.label}</span>
                <span className="text-lg font-semibold tabular-nums">{dayNumber(day.date)}</span>
              </button>
            )
          })}
        </div>
        {chosen ? (
          <div className="mt-4 text-fogo-text">
            <p>
              <span className="text-2xl font-semibold tabular-nums">{fmtCount(chosen.predicted)}</span>
              <span className="ml-2 text-sm text-fogo-muted">
                alertas esperados {chosen.label === 'Hoje' ? 'hoje' : chosen.label === 'Amanhã' ? 'amanhã' : `na ${chosen.weekday}`}
              </span>
            </p>
            {chosen.observed != null ? (
              <p className="mt-1 text-sm text-fogo-muted">
                Já entraram <span className="tabular-nums text-fogo-text">{chosen.observed}</span> hoje. O dia ainda não fechou, então este recorte não entra no acerto.
              </p>
            ) : (
              <p className="mt-1 text-sm text-fogo-muted">O volume usa o nível dos dias já fechados. Um weekday novo não fica em zero.</p>
            )}
            <p className="mt-1 text-xs text-fogo-muted">{skillLine(chosen.skill)}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-fogo-muted">Sem recorte diário neste conjunto.</p>
        )}
      </section>

      <section className="border-t border-fogo-border/80 pt-6">
        <HorizonSkillList skills={summary?.accuracy?.byHorizon ?? []} />
      </section>
      </div>
      <ForecastGlance summary={summary} />
      </div>

      <section className="border-t border-fogo-border/80 pt-6">
        <div>
          <p className="text-sm text-fogo-muted">Agora na mesa</p>
          <p className="mt-3 text-sm text-fogo-text">
            {openAlerts} alerta{openAlerts === 1 ? '' : 's'} aberto{openAlerts === 1 ? '' : 's'}
          </p>
          <ul className="mt-3 space-y-2">
            {(summary?.anomalies ?? []).slice(0, 3).map((item) => (
              <li key={item.id} className="text-sm text-fogo-text">
                {item.title}
                <span className="ml-2 text-xs text-fogo-muted">{item.location}</span>
              </li>
            ))}
            {(summary?.anomalies ?? []).length === 0 ? (
              <li className="text-sm text-fogo-muted">Nenhum sinal extra além das janelas acima.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <ForecastHistory days={summary?.accuracy?.history ?? []} />

    </div>
  )
}

function verdict(level: PredictiveHistoryDay['level']): string {
  if (level === 'exact') return 'Bateu'
  if (level === 'useful') return 'Perto'
  if (level === 'off') return 'Longe'
  if (level === 'miss') return 'Não entrou'
  return 'Sem medida'
}

function ComparePair({ predicted, observed, level }: { predicted: number; observed: number; level: PredictiveHistoryDay['level'] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3">
      <div>
        <p className="text-[11px] text-fogo-muted">Previu</p>
        <p className="text-2xl font-semibold tabular-nums text-fogo-text">{fmtCount(predicted)}</p>
      </div>
      <div>
        <p className="text-[11px] text-fogo-muted">Aconteceu</p>
        <p className="text-2xl font-semibold tabular-nums text-fogo-text">{fmtCount(observed)}</p>
      </div>
      <p className="col-span-2 text-xs text-fogo-muted">{verdict(level)}</p>
    </div>
  )
}

function ForecastHistory({ days }: { days: PredictiveHistoryDay[] }) {
  return (
    <section className="border-t border-fogo-border/80 pt-6">
      <p className="text-sm text-fogo-muted">Histórico das previsões</p>
      <p className="mt-1 max-w-xl text-xs text-fogo-muted">
        Cada dia já fechado mostra o que a mesa colocaria à 0h e o que entrou depois. Previu é o número do modelo. Aconteceu é a quantidade de ocorrências naquela janela.
      </p>
      {days.length === 0 ? (
        <p className="mt-3 text-sm text-fogo-muted">Ainda não há um dia fechado para comparar a previsão com o que aconteceu.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {days.map((day) => (
            <article key={day.date} className="border-t border-fogo-border/70 pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm text-fogo-text">
                {day.whenLabel} <span className="text-fogo-muted">{day.dateLabel}</span>
              </p>
              <p className="mt-3 text-sm text-fogo-muted">Previsão do dia — quantidade de ocorrências</p>
              <ComparePair predicted={day.predicted} observed={day.observed} level={day.level} />
              <div className="mt-4 grid gap-px overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-border sm:grid-cols-5">
                {day.windows.map((window) => (
                  <div key={window.id} className="bg-fogo-surface px-3 py-3">
                    <p className="text-xs text-fogo-text">{window.label}</p>
                    <p className="mt-0.5 text-[11px] text-fogo-muted">
                      {window.fromLabel} → {window.toLabel}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-fogo-muted">Previu</p>
                        <p className="text-lg font-semibold tabular-nums text-fogo-text">{fmtCount(window.predicted)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-fogo-muted">Aconteceu</p>
                        <p className="text-lg font-semibold tabular-nums text-fogo-text">{fmtCount(window.observed)}</p>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-fogo-muted">{verdict(window.level)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function chanceTone(label: PredictiveHourForecast['probabilityLabel']) {
  if (label === 'alta') return 'text-fogo-accent'
  if (label === 'média') return 'text-fogo-text'
  return 'text-fogo-muted'
}

function HourlyAlertBoard({ hours }: { hours: PredictiveHourForecast[] }) {
  const nowLabel = hours[0]?.fromLabel
  return (
    <section>
      <p className="text-sm text-fogo-muted">Alertas nas próximas horas</p>
      <p className="mt-1 text-xs text-fogo-muted">
        {nowLabel ? `A partir de agora, ${nowLabel}.` : 'A partir da hora atual.'} Janela curta erra mais — a chance e a confiança vêm juntas.
      </p>
      <div className="mt-3 grid gap-px overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-border sm:grid-cols-5">
        {hours.map((row) => (
          <div key={row.id} className="bg-fogo-surface px-4 py-4">
            <p className="text-sm text-fogo-muted">{row.label}</p>
            <p className="mt-2 font-semibold tabular-nums tracking-tight text-fogo-text" style={{ fontSize: '2.25rem', lineHeight: 1 }}>
              {fmtCount(row.predicted)}
            </p>
            <p className="mt-2 text-xs text-fogo-muted">
              {row.fromLabel} → {row.toLabel}
            </p>
            <p className={cn('mt-2 text-xs', chanceTone(row.probabilityLabel))}>
              Chance {row.probabilityLabel}
              {row.probability != null ? ` · ${Math.round(row.probability * 100)}%` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-fogo-muted">
              Confiança {row.confidenceLabel}
              {row.hours <= 3 ? ' · recorte curto' : ''}
            </p>
            <p className="mt-1 text-[11px] text-fogo-muted">{skillLine(row.skill)}</p>
          </div>
        ))}
      </div>
      {hours.length === 0 ? (
        <p className="mt-3 text-sm text-fogo-muted">Sem histórico de alertas o bastante para montar as janelas de hora.</p>
      ) : null}
    </section>
  )
}

function skillLine(skill?: PredictiveHorizonSkill): string {
  if (!skill || skill.scored === 0) return 'Sem janela fechada fora do treino'
  const pct = skill.utilization == null ? '—' : `${Math.round(skill.utilization * 100)}%`
  const mae = skill.mae == null ? '' : ` · erro médio ${fmtCount(skill.mae)}`
  return `${skill.exact} acertos · ${pct} em ${skill.scored} janelas${mae}`
}

function HorizonSkillList({ skills }: { skills: PredictiveHorizonSkill[] }) {
  return (
    <div>
      <p className="text-sm text-fogo-muted">Acerto por horizonte</p>
      <p className="mt-1 text-xs text-fogo-muted">
        Cada linha compara o que o modelo diria antes da janela com os alertas que entraram depois. O próprio dia não entra no treino.
      </p>
      <ul className="mt-3 space-y-1.5">
        {skills.map((skill) => (
          <li key={skill.id} className="flex items-baseline justify-between gap-3 text-sm text-fogo-text">
            <span>{skill.label}</span>
            <span className="text-right text-xs text-fogo-muted">{skillLine(skill)}</span>
          </li>
        ))}
        {skills.length === 0 ? <li className="text-sm text-fogo-muted">O histórico ainda não fechou uma janela.</li> : null}
      </ul>
    </div>
  )
}

function hitEvolution(pairs: PredictiveAccuracyPair[]) {
  const closed = pairs.filter((row) => !row.inProgress && row.level !== 'pending')
  let hits = 0
  return closed.map((row, index) => {
    if (row.level === 'exact' || row.level === 'useful') hits += 1
    const [, month, day] = row.date.split('-')
    return {
      dia: day && month ? `${day}/${month}` : row.label,
      acerto: Math.round((hits / (index + 1)) * 100),
    }
  })
}

function HitMountain({ points, empty }: { points: PredictiveHitPoint[]; empty: string }) {
  const chart = useChartTheme()
  if (points.length === 0) {
    return <p className="flex h-[72px] items-center text-[11px] text-fogo-muted">{empty}</p>
  }
  return (
    <div className="h-[72px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: chart.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: chart.axis }} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={{ ...chart.tooltip, fontSize: 11 }} formatter={(value) => [`${value}%`, 'Acerto']} />
          <Area type="monotone" dataKey="acerto" stroke={chart.accent} fill={chart.accent} fillOpacity={0.28} strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function LiveHitCard({ summary }: { summary: PredictiveSummary | null }) {
  const hours = summary?.accuracy?.hourEvolution ?? []
  const today = summary?.accuracy?.todayEvolution ?? []
  const hourLast = hours[hours.length - 1]?.acerto
  const todayLast = today[today.length - 1]?.acerto
  return (
    <Card className="space-y-2 p-2.5">
      <div>
        <p className="text-[11px] font-medium text-fogo-text">Evolução das horas</p>
        <p className="text-[10px] text-fogo-muted">
          {hourLast == null ? 'Horas já fechadas, em %' : `${hourLast}% nas horas já fechadas`}
        </p>
        <HitMountain points={hours} empty="Ainda não há hora fechada para medir." />
      </div>
      <div>
        <p className="text-[11px] font-medium text-fogo-text">Dia de hoje</p>
        <p className="text-[10px] text-fogo-muted">
          {todayLast == null ? 'Andamento de hoje, em %' : `${todayLast}% até esta hora`}
        </p>
        <HitMountain points={today} empty="O dia de hoje passa a ser medido quando já existe um dia fechado." />
      </div>
    </Card>
  )
}

function ForecastGlance({ summary }: { summary: PredictiveSummary | null }) {
  const chart = useChartTheme()
  const series = hitEvolution(summary?.accuracy?.alerts.pairs ?? [])
  const last = series[series.length - 1]?.acerto
  const base = [
    { nome: 'Alertas', valor: summary?.observationCount ?? 0 },
    { nome: 'Dias', valor: summary?.upcomingHours?.[0]?.sampleDays ?? 0 },
    { nome: 'Janelas', valor: summary?.accuracy?.alerts.scored ?? 0 },
  ]
  const tip = { ...chart.tooltip, fontSize: 11 }

  return (
    <aside className="space-y-3">
      <Card className="p-2.5">
        <p className="text-[11px] font-medium text-fogo-text">Evolução do acerto</p>
        <p className="text-[10px] text-fogo-muted">
          {last == null ? 'Dias fechados, em %' : `${last}% nas janelas já fechadas`}
        </p>
        <div className="mt-1 h-[92px]">
          {series.length === 0 ? (
            <p className="flex h-full items-center text-[11px] text-fogo-muted">Ainda não há dia fechado para medir.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                <XAxis dataKey="dia" tick={{ fontSize: 9, fill: chart.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: chart.axis }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={tip}
                  formatter={(value) => [`${value}%`, 'Acerto']}
                />
                <Area type="monotone" dataKey="acerto" stroke={chart.accent} fill={chart.accent} fillOpacity={0.28} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <LiveHitCard summary={summary} />

      <Card className="p-2.5">
        <p className="text-[11px] font-medium text-fogo-text">Base da previsão</p>
        <p className="text-[10px] text-fogo-muted">Alertas, dias fechados e janelas que entram no cálculo</p>
        <div className="mt-1 h-[92px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={base} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="nome" tick={{ fontSize: 9, fill: chart.axis }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={tip} formatter={(value) => [fmtCount(Number(value)), 'Volume']} />
              <Bar dataKey="valor" fill={chart.accent} radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <AnalyzedVolumeCard weatherReadings={summary?.weatherReadings ?? 0} />
    </aside>
  )
}

function AnalyzedVolumeCard({ weatherReadings }: { weatherReadings: number }) {
  const { assets, alerts, incidents } = useOpsData()
  const total = assets.length + alerts.length + incidents.length + weatherReadings
  return (
    <Card className="relative overflow-hidden border-fogo-accent/50 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_srgb,var(--fogo-accent)_32%,transparent),transparent_68%)] p-3 shadow-[0_0_22px_color-mix(in_srgb,var(--fogo-accent)_22%,transparent)]">
      <p className="text-[10px] font-medium text-fogo-accent">Dados analisados</p>
      <p className="mt-1 text-[2rem] font-semibold leading-none tabular-nums tracking-tight text-fogo-text">
        {total.toLocaleString('pt-BR')}
      </p>
    </Card>
  )
}
