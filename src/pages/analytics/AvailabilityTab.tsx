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
import { Card } from '@/components/ui/Card'
import { ChartCard } from '@/components/charts/ChartCard'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useOpsData } from '@/context/OpsDataContext'
import { computeAvailability } from '@/lib/assetAvailability'
import { CADASTRAL_LABELS, normalizeCadastral } from '@/lib/assetTruth'
import { useChartTheme } from '@/lib/chartTheme'
import type { ChartPeriod, RegionSummary } from '@/types'

export function AvailabilityTab({
  period,
  regions,
}: {
  period: ChartPeriod
  regions: RegionSummary[]
}) {
  const chart = useChartTheme()
  const { data } = useAnalytics(period)
  const { assets } = useOpsData()
  const live = computeAvailability(assets)
  const cadMix = Object.entries(
    assets.reduce<Record<string, number>>((acc, a) => {
      const cad = normalizeCadastral(a.cadastralStatus)
      acc[cad] = (acc[cad] ?? 0) + 1
      return acc
    }, {}),
  ).map(([key, value]) => ({ name: CADASTRAL_LABELS[key as keyof typeof CADASTRAL_LABELS] ?? key, value }))

  const pieColors = [chart.success, chart.critical, chart.mutedLine, '#d97706', '#8b5cf6', chart.accent]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat label="Disponibilidade" value={`${live.percent}%`} hint="operacional / elegíveis" />
        <Stat label="Elegíveis" value={String(live.eligible)} hint="na conta" />
        <Stat label="Fora da conta" value={String(live.excluded)} hint="não instalado + baixado" />
        <Stat label="Operacionais" value={String(live.operational)} />
        <Stat label="Em alerta" value={String(live.alert)} />
      </div>
      <p className="text-[11px] text-fogo-muted">
        A porcentagem de disponibilidade não inclui ativos ainda não instalados nem baixados. O inventário total
        continua visível no cadastro.
        {data
          ? ` API no período ${period}: ${data.assetAvailability}% sobre ${data.assetAvailabilityEligible ?? data.totals.assetsEligible ?? '—'} elegíveis.`
          : ''}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Situação cadastral">
          {cadMix.length === 0 ? (
            <p className="p-4 text-xs text-fogo-muted">Inventário vazio.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={cadMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80}>
                  {cadMix.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chart.tooltip} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Disponibilidade por região" description="Só ativos na conta (exclui não instalado/baixado)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={regions}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
              <XAxis dataKey="region" tick={{ ...chart.tick, fontSize: 10 }} interval={0} angle={-16} textAnchor="end" height={48} />
              <YAxis tick={chart.tick} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={chart.tooltip} />
              <Bar dataKey="availabilityPercent" name="% disponível" fill={chart.success} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
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
