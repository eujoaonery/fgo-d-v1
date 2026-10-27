import { createContext, useContext, useMemo, useState } from 'react'

/** Limite §4.6 — dado de telemetria/atualização considerado desatualizado após 5 min sem refresh. */
export const STALE_DATA_MS = 5 * 60 * 1000

export const OPS_REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste'] as const

interface OpsFilterContextValue {
  region: string
  setRegion: (region: string) => void
  staleMs: number
  isStale: (isoTimestamp: string | undefined) => boolean
}

const OpsFilterContext = createContext<OpsFilterContextValue | null>(null)

export function OpsFilterProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState('')

  const value = useMemo(() => {
    const isStale = (isoTimestamp: string | undefined) => {
      if (!isoTimestamp) return true
      const t = new Date(isoTimestamp).getTime()
      if (Number.isNaN(t)) return true
      return Date.now() - t > STALE_DATA_MS
    }
    return { region, setRegion, staleMs: STALE_DATA_MS, isStale }
  }, [region])

  return <OpsFilterContext.Provider value={value}>{children}</OpsFilterContext.Provider>
}

export function useOpsFilter() {
  const ctx = useContext(OpsFilterContext)
  if (!ctx) throw new Error('useOpsFilter must be used within OpsFilterProvider')
  return ctx
}

/** Filtra listas por região compartilhada (mapa, KPIs, tabelas). */
export function useRegionFilter<T extends { region?: string }>(items: T[]): T[] {
  const { region } = useOpsFilter()
  return useMemo(() => {
    if (!region) return items
    return items.filter((i) => i.region === region)
  }, [items, region])
}
