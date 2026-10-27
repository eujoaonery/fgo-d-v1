import { useMemo, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { OpsRegionFilterBar } from '@/components/layout/OpsRegionFilterBar'
import { CameraTile } from '@/components/cameras/CameraTile'
import { useOpsData } from '@/context/OpsDataContext'
import { useOpsFilter } from '@/context/OpsFilterContext'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { cameraFeedsFromAssets } from '@/lib/cameraFeedsFromAssets'
import type { CameraStreamStatus } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LayoutGrid, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type GridDensity = 'compact' | 'comfortable'

export function CameraMonitorPage() {
  const { assets, simulation, apiConnected } = useOpsData()
  const { region, isStale } = useOpsFilter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CameraStreamStatus | ''>('')
  const [density, setDensity] = useState<GridDensity>('compact')
  const { openAsset, assetId } = useAssetDossier()
  const [page, setPage] = useState(0)
  const pageSize = density === 'compact' ? 80 : 48

  const monitorCameras = useMemo(() => cameraFeedsFromAssets(assets), [assets])

  const stats = useMemo(() => {
    const online = monitorCameras.filter((c) => c.status === 'online').length
    const alerta = monitorCameras.filter((c) => c.status === 'alerta').length
    const offline = monitorCameras.filter((c) => c.status === 'offline').length
    return { total: monitorCameras.length, online, alerta, offline }
  }, [monitorCameras])

  const filtered = useMemo(() => {
    return monitorCameras.filter((c) => {
      if (region && c.region !== region) return false
      if (status && c.status !== status) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          c.label.toLowerCase().includes(q) ||
          c.assetId.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [monitorCameras, region, status, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const telemetryStale = isStale(simulation?.lastTickAt)

  return (
    <PageShell
      searchValue={search}
      onSearchChange={(v) => {
        setSearch(v)
        setPage(0)
      }}
      searchPlaceholder="Buscar câmera por ID, ativo ou local…"
    >
      {telemetryStale && apiConnected ? (
        <p className="mb-2 rounded-fogo-md border border-fogo-warning/40 bg-fogo-warning/10 px-3 py-2 text-xs text-fogo-warning">
          Telemetria do monitoramento sem atualização recente — estados podem estar desatualizados (§4.6).
        </p>
      ) : null}

      <OpsRegionFilterBar />

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatCard label="Câmeras cadastradas" value={stats.total} />
        <StatCard label="Online" value={stats.online} tone="success" />
        <StatCard label="Em alerta" value={stats.alerta} tone="warning" />
        <StatCard label="Offline" value={stats.offline} tone="muted" />
        <StatCard label="Exibindo agora" value={pageItems.length} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as CameraStreamStatus | '')
            setPage(0)
          }}
        >
          <option value="">Todos estados</option>
          <option value="online">Online</option>
          <option value="alerta">Alerta</option>
          <option value="offline">Offline</option>
        </select>
        <Button
          variant={density === 'compact' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setDensity('compact')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Grade densa
        </Button>
        <Button
          variant={density === 'comfortable' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setDensity('comfortable')}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Janelas maiores
        </Button>
        <p className="ml-auto text-xs text-fogo-muted">
          {filtered.length} câmeras · imagem estática por ativo; status via motor/API
        </p>
      </div>

      {stats.total === 0 ? (
        <p className="py-12 text-center text-sm text-fogo-muted">
          Cadastre ativos da categoria câmera no Inventário da cidade para montar o mosaico CFTV.
        </p>
      ) : (
        <>
          <div
            className={cn(
              'grid gap-1.5 sm:gap-2',
              density === 'compact'
                ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
            )}
          >
            {pageItems.map((camera) => (
              <CameraTile
                key={camera.id}
                camera={camera}
                selected={assetId === camera.assetId}
                onSelect={() => openAsset(camera.assetId)}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-fogo-muted">
            <span>
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </PageShell>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'warning' | 'muted'
}) {
  return (
    <Card className="fogo-glass px-3 py-2.5">
      <p className="text-[10px] text-fogo-muted">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'success' && 'text-fogo-success',
          tone === 'warning' && 'text-fogo-warning',
          tone === 'muted' && 'text-fogo-muted',
          !tone && 'text-fogo-text',
        )}
      >
        {value}
      </p>
    </Card>
  )
}
