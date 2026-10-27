import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { RegionVisionTab } from '@/pages/analytics/RegionVisionTab'
import type { ChartPeriod } from '@/types'

function parsePeriod(raw: string | null): ChartPeriod {
  return raw === '24h' || raw === '7d' || raw === '30d' ? raw : '7d'
}

export function RegionVisionPage() {
  const [params, setParams] = useSearchParams()
  const period = parsePeriod(params.get('periodo'))
  const setPeriod = (value: ChartPeriod) => {
    const next = new URLSearchParams(params)
    if (value === '7d') next.delete('periodo')
    else next.set('periodo', value)
    setParams(next, { replace: true })
  }
  return (
    <PageShell>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fogo-text">Visão por Região</h2>
            <p className="mt-0.5 text-xs text-fogo-muted">
              Ocorrências, ordens de serviço, previsão do motor e clima sobre o município.
            </p>
          </div>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
        <RegionVisionTab period={period} />
      </div>
    </PageShell>
  )
}
