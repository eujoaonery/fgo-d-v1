import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartPeriod } from '@/types'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useChartTheme } from '@/lib/chartTheme'

interface BottomAnalyticsStripProps {
  period: ChartPeriod
}

export function BottomAnalyticsStrip({ period }: BottomAnalyticsStripProps) {
  const chart = useChartTheme()
  const { data, loading } = useAnalytics(period)
  const tickSm = { ...chart.tick, fontSize: 9 }

  const series = data?.incidentsTimeSeries ?? []
  const byCategory = data?.incidentsByCategory ?? []
  const byRegion = data?.incidentsByRegion ?? []
  const availability = data?.assetAvailability ?? 0
  const gaugeData = [{ name: 'Disp.', value: availability, fill: chart.accent }]

  return (
    <div className="grid gap-2 lg:grid-cols-4">
      {loading ? (
        <p className="col-span-full text-center text-xs text-fogo-muted">Atualizando análises…</p>
      ) : null}
      <OpsPanel title="Ocorrências por categoria" compact bodyClassName="p-2 pt-0">
        {byCategory.length === 0 ? (
          <p className="p-4 text-[10px] text-fogo-muted">Sem ocorrências no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={byCategory} dataKey="count" nameKey="category" innerRadius={34} outerRadius={52} paddingAngle={2}>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={chart.piePalette[i % chart.piePalette.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chart.tooltip} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </OpsPanel>

      <OpsPanel title="Fluxo de ocorrências" compact bodyClassName="p-2 pt-0">
        {series.length === 0 ? (
          <p className="p-4 text-[10px] text-fogo-muted">Sem série temporal no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={tickSm} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={tickSm} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
              <Tooltip contentStyle={chart.tooltip} />
              <Line type="monotone" dataKey="total" stroke={chart.accent} strokeWidth={2} dot={false} name="Registradas" />
              <Line type="monotone" dataKey="resolved" stroke={chart.success} strokeWidth={1.5} dot={false} name="Resolvidas" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </OpsPanel>

      <OpsPanel title="Disponibilidade de ativos" compact bodyClassName="relative p-2 pt-0">
        <ResponsiveContainer width="100%" height={140}>
          <RadialBarChart innerRadius="68%" outerRadius="100%" data={gaugeData} startAngle={180} endAngle={0}>
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: chart.radialTrack }} />
            <Tooltip contentStyle={chart.tooltip} formatter={(v: number) => [`${v}%`, 'Disponibilidade']} />
          </RadialBarChart>
        </ResponsiveContainer>
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-lg font-semibold tabular-nums text-fogo-text">
          {availability}%
        </p>
      </OpsPanel>

      <OpsPanel title="Regiões com mais ocorrências" compact bodyClassName="p-2 pt-0">
        {byRegion.length === 0 ? (
          <p className="p-4 text-[10px] text-fogo-muted">Sem ocorrências regionais.</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart layout="vertical" data={byRegion} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="region" width={52} tick={tickSm} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chart.tooltip} />
              <Bar dataKey="count" fill={chart.accentSoft} stroke={chart.accent} strokeWidth={0.6} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </OpsPanel>
    </div>
  )
}
