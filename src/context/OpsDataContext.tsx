import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useOpsRealtime } from '@/hooks/useOpsRealtime'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { useOptionalTenant } from '@/context/TenantContext'
import { isClientBffAuth } from '@/lib/authMode'
import type { MapMunicipality } from '@/lib/mapMunicipality'
import { isOsTicketPrediction } from '@/lib/predictionView'
import {
  checkApiHealth,
  createAsset,
  createTeam,
  createWorkOrder as createWorkOrderRequest,
  deleteAsset,
  deleteTeam,
  fetchBootstrap,
  patchAlert,
  assumeAlert as assumeAlertRequest,
  patchIncident,
  patchSimulation,
  resetMonitoringOperationalData,
  dispatchIncidentTeam,
  scheduleWorkOrder as scheduleWorkOrderRequest,
  updateAsset,
  updateTeam,
  createIncidentFromAlert,
  linkAlertsToIncident,
  fetchPredictions,
  type AssetUpsertBody,
  type PredictionRecord,
} from '@/lib/api'
import type {
  ActivityEvent,
  AlertState,
  AssetCategory,
  Incident,
  IncidentStatus,
  MaintenanceOrder,
  MapMarker,
  OperationalAlert,
  SimulationSettings,
  SimulationIntensity,
  UrbanAsset,
  Team,
} from '@/types'

export type ApiStatus = 'connecting' | 'online' | 'offline'

const OFFLINE_HOLD_MS = 2000

interface OpsDataContextValue {
  apiConnected: boolean
  /** Só fica `offline` depois de falha confirmada — nunca no intervalo de conexão. */
  apiStatus: ApiStatus
  /** Primeiro bootstrap da cidade atual já chegou — não pintar placeholder. */
  dataReady: boolean
  simulation: SimulationSettings | null
  incidents: Incident[]
  alerts: OperationalAlert[]
  predictions: PredictionRecord[]
  activity: ActivityEvent[]
  assets: UrbanAsset[]
  assetCategories: AssetCategory[]
  maintenance: MaintenanceOrder[]
  teams: Team[]
  mapMarkers: MapMarker[]
  cityMapImage: string
  /** Null nas cidades criadas antes da escolha do município do mapa. */
  mapHome: MapMunicipality | null
  refresh: () => Promise<void>
  setSimulation: (patch: {
    enabled?: boolean
    intensity?: SimulationIntensity
    tickIntervalMs?: number
  }) => Promise<void>
  updateIncidentStatus: (id: string, status: IncidentStatus, note?: string) => Promise<void>
  patchIncidentFields: (id: string, body: Parameters<typeof patchIncident>[1]) => Promise<void>
  createIncidentFromAlert: (
    alertProtocol: string,
    body: { subjectId: string; description?: string; priority?: Incident['priority'] },
  ) => Promise<Incident>
  createWorkOrder: (body: Parameters<typeof createWorkOrderRequest>[0]) => Promise<Incident>
  linkAlertsToIncident: (incidentId: string, alertProtocols: string[]) => Promise<void>
  saveAsset: (body: AssetUpsertBody) => Promise<void>
  patchAsset: (id: string, body: Partial<AssetUpsertBody> & { cadastralJustification?: string }) => Promise<void>
  removeAsset: (id: string) => Promise<void>
  saveTeam: (body: Partial<Team> & { name: string; specialty: string; region: string }) => Promise<void>
  patchTeam: (id: string, body: Partial<Team> & { mapX?: number; mapY?: number }) => Promise<void>
  removeTeam: (id: string) => Promise<void>
  transitionAlert: (protocol: string, state: AlertState, note?: string) => Promise<void>
  assumeAlert: (protocol: string) => Promise<void>
  resetMonitoringData: () => Promise<void>
  dispatchTeam: (incidentId: string, teamId: string) => Promise<void>
  scheduleWorkOrder: (incidentId: string, body: { teamId: string; start: string; end?: string }) => Promise<void>
}

const OpsDataContext = createContext<OpsDataContextValue | null>(null)

function hasAuthSession(session: ReturnType<typeof useCcoAuth>['session'], bff: boolean): boolean {
  if (!session) return false
  if (bff) return true
  return 'access_token' in session && !!session.access_token
}

export function OpsDataProvider({ children }: { children: React.ReactNode }) {
  const { session, requireAuth } = useCcoAuth()
  const tenantSlug = useOptionalTenant()?.slug ?? ''
  const bffAuth = isClientBffAuth()
  const sessionActive = hasAuthSession(session, bffAuth)
  const [apiConnected, setApiConnected] = useState(false)
  const [apiStatus, setApiStatus] = useState<ApiStatus>('connecting')
  const [dataReady, setDataReady] = useState(false)
  const loadGen = useRef(0)
  const simulationEpoch = useRef(0)
  const offlineHold = useRef<number | null>(null)

  const clearOfflineHold = useCallback(() => {
    if (offlineHold.current != null) {
      window.clearTimeout(offlineHold.current)
      offlineHold.current = null
    }
  }, [])

  const markOnline = useCallback(() => {
    clearOfflineHold()
    setApiConnected(true)
    setApiStatus('online')
  }, [clearOfflineHold])

  const scheduleOffline = useCallback(() => {
    if (offlineHold.current != null) return
    offlineHold.current = window.setTimeout(() => {
      offlineHold.current = null
      setApiConnected(false)
      setApiStatus('offline')
    }, OFFLINE_HOLD_MS)
  }, [])

  useEffect(() => () => clearOfflineHold(), [clearOfflineHold])
  const [simulation, setSimulationState] = useState<SimulationSettings | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [alerts, setAlerts] = useState<OperationalAlert[]>([])
  const [predictions, setPredictions] = useState<PredictionRecord[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [assets, setAssets] = useState<UrbanAsset[]>([])
  const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceOrder[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([])
  const [cityMapImage, setCityMapImage] = useState('')
  const [mapHome, setMapHome] = useState<MapMunicipality | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  const applyBootstrap = useCallback((data: Awaited<ReturnType<typeof fetchBootstrap>>, epoch: number) => {
    setSimulationState((current) => {
      if (epoch !== simulationEpoch.current) return current
      return data.simulation ?? current
    })
    setIncidents(data.incidents)
    setAlerts(data.alerts)
    setActivity(data.activity)
    setAssets(data.assets)
    setAssetCategories(data.assetCategories ?? [])
    setMaintenance(data.maintenance)
    setTeams(data.teams ?? [])
    setMapMarkers(
      data.mapMarkers.map((m) => ({
        ...m,
        kind: m.kind as MapMarker['kind'],
        status: m.status as MapMarker['status'],
        priority: m.priority as MapMarker['priority'],
      })),
    )
    setCityMapImage(data.cityMapImage || '')
    setMapHome(data.mapHome ?? null)
    markOnline()
    setDataReady(true)
  }, [markOnline])

  const clearOpsSnapshot = useCallback(() => {
    setSimulationState(null)
    setIncidents([])
    setAlerts([])
    setPredictions([])
    setActivity([])
    setAssets([])
    setAssetCategories([])
    setMaintenance([])
    setTeams([])
    setMapMarkers([])
    setCityMapImage('')
    setMapHome(null)
    setDataReady(false)
  }, [])

  useEffect(() => {
    loadGen.current += 1
    clearOfflineHold()
    setApiConnected(false)
    setApiStatus('connecting')
    clearOpsSnapshot()
  }, [clearOfflineHold, clearOpsSnapshot, tenantSlug, sessionActive])

  const refresh = useCallback(async () => {
    if (requireAuth && !sessionActive) {
      clearOfflineHold()
      setApiConnected(false)
      setApiStatus('connecting')
      clearOpsSnapshot()
      return
    }
    const gen = loadGen.current
    const ok = await checkApiHealth()
    if (gen !== loadGen.current) return
    if (!ok) {
      scheduleOffline()
      return
    }
    const epoch = simulationEpoch.current
    markOnline()
    try {
      const [data, nextPredictions] = await Promise.all([
        fetchBootstrap(),
        fetchPredictions(200).catch(() => [] as PredictionRecord[]),
      ])
      if (gen !== loadGen.current) return
      applyBootstrap(data, epoch)
      setPredictions(nextPredictions.filter((p) => !isOsTicketPrediction(p)))
    } catch {
      if (gen !== loadGen.current) return
    }
  }, [applyBootstrap, clearOfflineHold, clearOpsSnapshot, markOnline, requireAuth, scheduleOffline, sessionActive])

  useEffect(() => {
    void refresh()
  }, [refresh, tenantSlug, sessionActive])

  useOpsRealtime(apiConnected && sessionActive, refresh, setRealtimeConnected)

  useEffect(() => {
    const ms =
      apiStatus === 'online'
        ? realtimeConnected
          ? simulation?.enabled
            ? 90000
            : 120000
          : simulation?.enabled
            ? 8000
            : 20000
        : 5000
    const id = window.setInterval(() => void refresh(), ms)
    return () => window.clearInterval(id)
  }, [apiStatus, simulation?.enabled, realtimeConnected, refresh])

  const setSimulation = useCallback(
    async (patch: { enabled?: boolean; intensity?: SimulationIntensity; tickIntervalMs?: number }) => {
      const epoch = ++simulationEpoch.current
      loadGen.current += 1
      try {
        const next = await patchSimulation(patch)
        if (epoch !== simulationEpoch.current) return
        setSimulationState(next)
        markOnline()
      } finally {
        if (epoch === simulationEpoch.current) await refresh()
      }
    },
    [markOnline, refresh],
  )

  const updateIncidentStatus = useCallback(
    async (id: string, status: IncidentStatus, note?: string) => {
      if (!apiConnected) return
      await patchIncident(id, { status, notes: note, actorLabel: 'operador CCO' })
      await refresh()
    },
    [apiConnected, refresh],
  )

  const patchIncidentFields = useCallback(
    async (id: string, body: Parameters<typeof patchIncident>[1]) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await patchIncident(id, { ...body, actorLabel: 'operador CCO' })
      await refresh()
    },
    [apiConnected, refresh],
  )

  const createIncidentFromAlertFn = useCallback(
    async (alertProtocol: string, body: { subjectId: string; description?: string; priority?: Incident['priority'] }) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      const incident = await createIncidentFromAlert(alertProtocol, body)
      await refresh()
      return incident
    },
    [apiConnected, refresh],
  )

  const linkAlertsToIncidentFn = useCallback(
    async (incidentId: string, alertProtocols: string[]) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await linkAlertsToIncident(incidentId, alertProtocols)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const dispatchTeam = useCallback(
    async (incidentId: string, teamId: string) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await dispatchIncidentTeam(incidentId, teamId)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const scheduleWorkOrderFn = useCallback(
    async (incidentId: string, body: { teamId: string; start: string; end?: string }) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await scheduleWorkOrderRequest(incidentId, body)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const createWorkOrder = useCallback(
    async (body: Parameters<typeof createWorkOrderRequest>[0]) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      const incident = await createWorkOrderRequest(body)
      await refresh()
      return incident
    },
    [apiConnected, refresh],
  )

  const saveAsset = useCallback(
    async (body: AssetUpsertBody) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      const created = await createAsset(body)
      setAssets((prev) => [created, ...prev.filter((a) => a.id !== created.id)])
      void refresh()
    },
    [apiConnected, refresh],
  )

  const patchAsset = useCallback(
    async (id: string, body: Partial<AssetUpsertBody> & { cadastralJustification?: string }) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      const updated = await updateAsset(id, body)
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)))
      void refresh()
    },
    [apiConnected, refresh],
  )

  const removeAsset = useCallback(
    async (id: string) => {
      if (!apiConnected) return
      await deleteAsset(id)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const saveTeam = useCallback(
    async (body: Parameters<OpsDataContextValue['saveTeam']>[0]) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await createTeam(body)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const patchTeam = useCallback(
    async (id: string, body: Partial<Team> & { mapX?: number; mapY?: number }) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await updateTeam(id, body)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const removeTeam = useCallback(
    async (id: string) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await deleteTeam(id)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const transitionAlert = useCallback(
    async (protocol: string, state: AlertState, note?: string) => {
      if (!apiConnected) return
      await patchAlert(protocol, state, note)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const assumeAlert = useCallback(
    async (protocol: string) => {
      if (!apiConnected) throw new Error('Serviço indisponível')
      await assumeAlertRequest(protocol)
      await refresh()
    },
    [apiConnected, refresh],
  )

  const resetMonitoringData = useCallback(async () => {
    const epoch = ++simulationEpoch.current
    loadGen.current += 1
    const next = await resetMonitoringOperationalData()
    if (epoch !== simulationEpoch.current) return
    setSimulationState(next)
    await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      apiConnected,
      apiStatus,
      dataReady,
      simulation,
      incidents,
      alerts,
      predictions,
      activity,
      assets,
      assetCategories,
      maintenance,
      teams,
      mapMarkers,
      cityMapImage,
      mapHome,
      refresh,
      setSimulation,
      updateIncidentStatus,
      patchIncidentFields,
      createIncidentFromAlert: createIncidentFromAlertFn,
      createWorkOrder,
      linkAlertsToIncident: linkAlertsToIncidentFn,
      saveAsset,
      patchAsset,
      removeAsset,
      saveTeam,
      patchTeam,
      removeTeam,
      transitionAlert,
      assumeAlert,
      resetMonitoringData,
      dispatchTeam,
      scheduleWorkOrder: scheduleWorkOrderFn,
    }),
    [
      apiConnected,
      apiStatus,
      dataReady,
      simulation,
      incidents,
      alerts,
      predictions,
      activity,
      assets,
      assetCategories,
      maintenance,
      teams,
      mapMarkers,
      cityMapImage,
      mapHome,
      refresh,
      setSimulation,
      updateIncidentStatus,
      patchIncidentFields,
      createIncidentFromAlertFn,
      createWorkOrder,
      linkAlertsToIncidentFn,
      saveAsset,
      patchAsset,
      removeAsset,
      saveTeam,
      patchTeam,
      removeTeam,
      transitionAlert,
      assumeAlert,
      resetMonitoringData,
      dispatchTeam,
      scheduleWorkOrderFn,
    ],
  )

  return <OpsDataContext.Provider value={value}>{children}</OpsDataContext.Provider>
}

export function useOpsData() {
  const ctx = useContext(OpsDataContext)
  if (!ctx) throw new Error('useOpsData must be used within OpsDataProvider')
  return ctx
}
