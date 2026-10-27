import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '@/components/charts/ChartCard'
import { useChartTheme } from '@/lib/chartTheme'
import type { AlphaChartSeries } from '@/lib/prometheusAlpha'
import { formatChartDayPtBr, formatDateTimePtBr, withPtBrDates } from '@/lib/format'

function pointLabel(label: string, timestamp?: string): string {
  const raw = timestamp && /^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? timestamp : label
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatChartDayPtBr(raw)
  return label
}

export function AlphaCharts({ charts }: { charts: AlphaChartSeries[] }) {
  const theme = useChartTheme()
  if (!charts.length) {
    return <p className="text-sm text-fogo-muted">Nenhum gráfico para esta análise — a série veio vazia ou a fonte falhou.</p>
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {charts.map((c) => {
        const data = c.points.map((p) => ({ label: pointLabel(p.label, p.timestamp), valor: p.value }))
        const useLine = c.points.length > 8
        return (
          <ChartCard
            key={c.id}
            title={c.title}
            description={`${withPtBrDates(c.description)} Unidade: ${c.unit}. ${c.observed ? 'Observado.' : 'Previsto.'} ${c.source ?? ''} ${c.updatedAt ? `Atualizado ${formatDateTimePtBr(c.updatedAt)}` : ''}`}
          >
            <ResponsiveContainer width="100%" height={220}>
              {useLine ? (
                <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={theme.tick} interval="preserveStartEnd" />
                  <YAxis tick={theme.tick} unit={c.unit === '%' || c.unit === '°C' ? undefined : undefined} />
                  <Tooltip contentStyle={theme.tooltip} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name={c.observed ? 'Observado' : 'Previsto'}
                    stroke={c.observed ? theme.success : theme.accent}
                    connectNulls={false}
                    dot={false}
                    strokeDasharray={c.observed ? undefined : '5 4'}
                  />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={theme.tick} interval={0} angle={data.length > 6 ? -25 : 0} height={data.length > 6 ? 48 : 24} />
                  <YAxis tick={theme.tick} />
                  <Tooltip contentStyle={theme.tooltip} />
                  <Bar dataKey="valor" name={c.observed ? 'Observado' : 'Previsto'} fill={c.observed ? theme.success : theme.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
        )
      })}
    </div>
  )
}
