import { useEffect, useState } from 'react'
import { fetchAnalytics, type AnalyticsPayload } from '@/lib/api'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useOpsData } from '@/context/OpsDataContext'
import type { ChartPeriod } from '@/types'

export function useAnalytics(period: ChartPeriod) {
  const { region } = useOpsFilter()
  const { apiConnected, incidents, alerts, assets } = useOpsData()
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!apiConnected) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void fetchAnalytics(period, region || undefined)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar análises'))
      .finally(() => setLoading(false))
  }, [apiConnected, period, region, incidents.length, alerts.length, assets.length])

  return { data, loading, error }
}
