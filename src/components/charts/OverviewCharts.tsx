import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartPeriod } from '@/types'
import { ChartCard } from '@/components/charts/ChartCard'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useChartTheme } from '@/lib/chartTheme'

interface OverviewChartsProps {
  period: ChartPeriod
}

export function OverviewCharts({ period }: OverviewChartsProps) {
  const chart = useChartTheme()
  const { data, loading } = useAnalytics(period)

  const timeSeries = data?.incidentsTimeSeries ?? []
  const byCategory = data?.incidentsByCategory ?? []
  const byRegion = data?.incidentsByRegion ?? []
  const assetDist = data?.assetStatusDistribution ?? []
  const colors = [chart.success, '#d97706', chart.mutedLine]

  if (loading && !data) {
    return <p className="text-center text-xs text-fogo-muted">Carregando indicadores operacionais…</p>
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Evolução de ocorrências" description={`Período ${period} · dados operacionais reais`}>
        {timeSeries.length === 0 ? (
          <p className="p-4 text-xs text-fogo-muted">Sem ocorrências no período para plotar.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="label" tick={chart.tick} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={chart.tick} allowDecimals={false} />
              <Tooltip contentStyle={chart.tooltip} />
              <Legend />
              <Line type="monotone" dataKey="total" name="Registradas" stroke={chart.accent} strokeWidth={2} />
              <Line type="monotone" dataKey="resolved" name="Resolvidas" stroke={chart.success} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Distribuição por categoria">
        {byCategory.length === 0 ? (
          <p className="p-4 text-xs text-fogo-muted">Nenhuma ocorrência categorizada no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
              <XAxis dataKey="category" tick={{ ...chart.tick, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={chart.tick} allowDecimals={false} />
              <Tooltip contentStyle={chart.tooltip} />
              <Bar dataKey="count" fill={chart.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Estado dos ativos">
        {assetDist.length === 0 ? (
          <p className="p-4 text-xs text-fogo-muted">Inventário indisponível.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={assetDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {assetDist.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chart.tooltip} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Ocorrências por região">
        {byRegion.length === 0 ? (
          <p className="p-4 text-xs text-fogo-muted">Nenhuma ocorrência regional no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byRegion} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} />
              <XAxis type="number" tick={chart.tick} allowDecimals={false} />
              <YAxis type="category" dataKey="region" width={72} tick={chart.tick} />
              <Tooltip contentStyle={chart.tooltip} />
              <Bar dataKey="count" fill={chart.accentSoft} stroke={chart.accent} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
