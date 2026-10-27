import { useState } from 'react'
import { OpsHeader } from '@/components/layout/OpsHeader'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { KpiStrip } from '@/components/ops/KpiStrip'
import { OperationalMap } from '@/components/maps/OperationalMap'
import { CriticalAlertsPanel } from '@/components/ops/CriticalAlertsPanel'
import { BottomAnalyticsStrip } from '@/components/charts/BottomAnalyticsStrip'
import { IncidentDetailDrawer } from '@/pages/overview/IncidentDetailDrawer'
import { useOpsData } from '@/context/OpsDataContext'
import { RealAwaitingDataBanner } from '@/components/layout/DemoModeBanner'
import type { ChartPeriod, Incident } from '@/types'

export function OverviewPage() {
  const period: ChartPeriod = '7d'
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const { incidents, assets } = useOpsData()

  const openById = (id: string) => {
    const found = incidents.find((i) => i.id === id)
    if (found) setSelectedIncident(found)
  }

  return (
    <div className="fogo-scroll-subtle flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex h-full min-h-full shrink-0 flex-col overflow-hidden">
        <OpsHeader dense />
        <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:p-3">
          <div className="shrink-0 space-y-2">
            <RealAwaitingDataBanner empty={assets.length === 0} />
            <OpsRegionFilterBar className="px-0.5" />
            <KpiStrip />
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(168px,30%)] gap-2 xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[minmax(0,1fr)]">
            <OperationalMap variant="overview" className="h-full min-h-0 w-full" onOpenIncident={openById} />
            <CriticalAlertsPanel className="h-full min-h-0" onSelectIncident={openById} />
          </div>
        </main>
      </div>
      <div className="shrink-0 px-2 pb-3 lg:px-3">
        <BottomAnalyticsStrip period={period} />
      </div>
      <IncidentDetailDrawer incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
    </div>
  )
}
