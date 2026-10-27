import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { useOpsData } from '@/context/OpsDataContext'
import { AssetInventoryCard, AssetInventoryHero } from '@/components/assets/AssetInventoryCard'
import { AssetCadastroModal } from '@/components/assets/AssetCadastroModal'
import { AssetTruthBadges } from '@/components/ops/AssetTruthBadges'
import { DataOriginBadge } from '@/components/ops/DataOriginBadge'
import { Badge, statusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Card } from '@/components/ui/Card'
import { MariliaCityMap, type MariliaMapPoint } from '@/components/maps/MariliaCityMap'
import { DataGridCsvBar } from '@/components/data/DataGridCsvBar'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { CADASTRAL_LABELS, CONNECTIVITY_LABELS, deriveConnectivity, normalizeCadastral } from '@/lib/assetTruth'
import { specDisplayRows } from '@/lib/assetSpecs'
import { formatAssetAddress, parseAssetLocation, plottableAssetPoint } from '@/lib/mariliaAddresses'
import { isSystemOccurrence } from '@/lib/cityOccurrence'
import { isOccurrencePending } from '@/lib/occurrenceState'
import { alertSummaryForAsset, summarizeAssetAlerts } from '@/lib/mapAlerts'
import { isMobileLocationType } from '@/lib/mariliaGeo'
import { categoryToMarkerKind } from '@/lib/markerKind'
import { assetsToCsv, assetCsvTemplateRow } from '@/lib/csv/assetsCsv'
import type { AssetStatus, UrbanAsset } from '@/types'

const PAGE_SIZE_TABLE = 15
const PAGE_SIZE_BLOCKS = 8

export function CityInventoryPage() {
  const { assets, assetCategories, apiConnected, alerts, refresh, removeAsset, mapHome } = useOpsData()
  const mapBounds = mapHome?.bbox
  const { can } = useCcoAccess()
  const canManage = can('assets', 'manage')
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<AssetStatus | ''>('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<UrbanAsset | null>(null)
  const [layout, setLayout] = useState<'table' | 'blocks'>('table')
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('ativo'))
  const [page, setPage] = useState(0)
  const [tableFit, setTableFit] = useState<number | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const pagerRef = useRef<HTMLDivElement>(null)
  const pageSize = layout === 'table' ? (tableFit ?? PAGE_SIZE_TABLE) : PAGE_SIZE_BLOCKS

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (category && a.category !== category) return false
      if (status && a.status !== status) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          (a.serialNumber?.toLowerCase().includes(q) ?? false) ||
          (a.manufacturer?.toLowerCase().includes(q) ?? false) ||
          (a.model?.toLowerCase().includes(q) ?? false) ||
          (a.address?.toLowerCase().includes(q) ?? false) ||
          (a.patrimonyCode?.toLowerCase().includes(q) ?? false)
        )
      }
      return true
    })
  }, [assets, category, status, search])

  const openOccurrenceAssets = useMemo(() => {
    const ids = new Set<string>()
    for (const alert of alerts) {
      if (!alert.relatedAssetId || !isOccurrencePending(alert.state) || isSystemOccurrence(alert)) continue
      ids.add(alert.relatedAssetId)
    }
    return ids
  }, [alerts])

  const stats = useMemo(() => {
    let operacional = 0
    let alerta = 0
    let inativo = 0
    for (const asset of assets) {
      if (asset.status === 'inativo') {
        inativo += 1
        continue
      }
      if (asset.status === 'alerta' || openOccurrenceAssets.has(asset.id)) alerta += 1
      else operacional += 1
    }
    return { total: assets.length, operacional, alerta, inativo }
  }, [assets, openOccurrenceAssets])

  useEffect(() => {
    setPage(0)
  }, [search, category, status, layout])

  useLayoutEffect(() => {
    if (layout !== 'table') return
    const aside = asideRef.current
    const table = tableRef.current
    if (!aside || !table) return

    const fit = () => {
      if (!window.matchMedia('(min-width: 1280px)').matches) {
        setTableFit(null)
        return
      }
      const cardH = aside.getBoundingClientRect().height
      const headH = table.tHead?.getBoundingClientRect().height ?? 0
      const rowH = table.tBodies[0]?.rows[0]?.getBoundingClientRect().height ?? 0
      const pagerH = (pagerRef.current?.offsetHeight ?? 32) + 8
      if (cardH < 160 || rowH < 24) return
      const rows = Math.min(80, Math.max(PAGE_SIZE_TABLE, Math.round((cardH - pagerH - headH) / rowH)))
      setTableFit((prev) => (prev != null && Math.abs(prev - rows) <= 1 ? prev : rows))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(aside)
    window.addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [layout, selectedId, filtered.length])

  useEffect(() => {
    const id = params.get('ativo')
    if (!id) return
    setSelectedId(id)
    if (params.get('ficha') === '1') return
    if (assets.length === 0) return
    const idx = filtered.findIndex((item) => item.id === id)
    if (idx >= 0) setPage(Math.floor(idx / pageSize))
    if (canManage && params.get('editar') === '1') {
      const asset = assets.find((item) => item.id === id)
      if (asset) {
        setEditingAsset(asset)
        setEditorOpen(true)
      }
    }
    const next = new URLSearchParams(params)
    next.delete('ativo')
    next.delete('editar')
    setParams(next, { replace: true })
  }, [assets, canManage, filtered, pageSize, params, setParams])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
  const active: UrbanAsset | undefined = filtered.find((a) => a.id === selectedId) ?? filtered[0]

  function selectAsset(id: string) {
    setSelectedId(id)
    const idx = filtered.findIndex((item) => item.id === id)
    if (idx >= 0) setPage(Math.floor(idx / pageSize))
  }

  function openDetail(id: string) {
    const next = new URLSearchParams(params)
    next.set('ativo', id)
    next.set('ficha', '1')
    next.delete('editar')
    setParams(next)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingAsset(null)
    if (params.get('editar')) {
      const next = new URLSearchParams(params)
      next.delete('editar')
      setParams(next, { replace: true })
    }
  }

  function openCreate() {
    setEditingAsset(null)
    setEditorOpen(true)
  }

  async function excludeAsset(asset: UrbanAsset) {
    if (!canManage) return
    const ok = window.confirm(`Excluir ${asset.name} do inventário? O cadastro deixa de aparecer no mapa.`)
    if (!ok) return
    await removeAsset(asset.id)
  }
  const activeLoc = active ? parseAssetLocation(active.location) : undefined
  const activePoint = active ? plottableAssetPoint(active, mapBounds) : null

  const categories = useMemo(() => {
    const fromApi = assetCategories.map((c) => c.label)
    const fromAssets = assets.map((a) => a.category)
    return [...new Set([...fromApi, ...fromAssets])].sort()
  }, [assetCategories, assets])

  const mapPoints = useMemo(() => {
    const out: MariliaMapPoint[] = []
    const alertsByAsset = summarizeAssetAlerts(alerts)
    for (const a of filtered) {
      const point = plottableAssetPoint(a, mapBounds)
      const loc = parseAssetLocation(a.location)
      if (!point) continue
      const mobile = isMobileLocationType(loc?.locationType)
      const alert = alertSummaryForAsset(a, alertsByAsset)
      out.push({
        id: a.id,
        lat: point.lat,
        lng: point.lng,
        kind: categoryToMarkerKind(a.category),
        category: a.category,
        name: a.name,
        subtitle: loc ? formatAssetAddress(loc) : a.address || a.region,
        status: a.status,
        cadastralStatus: normalizeCadastral(a.cadastralStatus),
        role: 'cadastro',
        alert,
      })
      if (mobile && a.liveLocation) {
        out.push({
          id: `${a.id}::live`,
          lat: a.liveLocation.lat,
          lng: a.liveLocation.lng,
          kind: categoryToMarkerKind(a.category),
          category: a.category,
          name: a.name,
          subtitle: `posição corrente · ${formatDateTime(a.liveLocation.recordedAt)}`,
          status: a.status,
          cadastralStatus: normalizeCadastral(a.cadastralStatus),
          role: 'corrente',
          alert,
        })
      }
    }
    return out
  }, [filtered, alerts, mapBounds])

  return (
    <PageShell
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar ativo, patrimônio, SN ou endereço…"
    >
      <header className="mb-4 fogo-gradient-panel rounded-fogo-lg border border-fogo-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-fogo-text">Inventário da cidade</h2>
            <p className="mt-0.5 text-xs text-fogo-muted">
              Consulta no mapa para toda a operação. Cadastrar, editar e excluir ficam com quem tem permissão de gestão.
            </p>
          </div>
          {canManage ? (
            <Button size="sm" variant="primary" disabled={!apiConnected} onClick={openCreate}>
              Cadastrar ativo
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ['Ativos cadastrados', stats.total],
          ['Operacionais', stats.operacional],
          ['Em alerta', stats.alerta],
          ['Inativos', stats.inativo],
        ].map(([label, val]) => (
          <Card key={label} className="fogo-glass px-3 py-2">
            <p className="text-[10px] text-fogo-muted">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{val}</p>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as AssetStatus | '')}
        >
          <option value="">Todos estados operacionais</option>
          <option value="operacional">Operacional</option>
          <option value="alerta">Alerta</option>
          <option value="inativo">Inativo</option>
        </select>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setLayout('table')}
            className={cn(
              'rounded-fogo-md px-2.5 py-1.5 text-xs',
              layout === 'table' ? 'bg-fogo-accent/15 text-fogo-text' : 'text-fogo-muted',
            )}
          >
            Tabela
          </button>
          <button
            type="button"
            onClick={() => setLayout('blocks')}
            className={cn(
              'rounded-fogo-md px-2.5 py-1.5 text-xs',
              layout === 'blocks' ? 'bg-fogo-accent/15 text-fogo-text' : 'text-fogo-muted',
            )}
          >
            Blocos
          </button>
        </div>
      </div>

      {can('assets', 'view') ? (
        <div className="mb-3">
          <DataGridCsvBar
            kind="assets"
            apiConnected={apiConnected}
            canView={can('assets', 'view')}
            canManage={canManage}
            canExport={can('assets', 'export')}
            filteredCount={filtered.length}
            totalCount={assets.length}
            getFilteredCsv={() => assetsToCsv(filtered)}
            getTemplateCsv={assetCsvTemplateRow}
            filteredFilename="fogo-ativos-filtrado.csv"
            onImported={refresh}
          />
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-fogo-lg border border-fogo-border">
          <MariliaCityMap
            heightClass="h-[280px] sm:h-[340px] lg:h-[400px]"
            points={mapPoints}
            selectedId={active?.id}
            onSelect={(p) => selectAsset(p.id.replace(/::live$/, ''))}
          />
          <p className="border-t border-fogo-border bg-fogo-surface px-3 py-1.5 text-[11px] text-fogo-muted">
            {mapHome?.name ?? 'Marília'} · {mapPoints.filter((p) => p.role !== 'corrente').length} ativos com coordenada gravada
            {mapPoints.some((p) => p.role === 'corrente')
              ? ' · pontos claros = posição corrente de recurso móvel'
              : ''}
          </p>
        </div>
      ) : null}

      {assets.length === 0 ? (
        <p className="py-12 text-center text-sm text-fogo-muted">
          {canManage
            ? 'Nenhum ativo cadastrado. Use Cadastrar ativo para incluir o primeiro elemento da cidade.'
            : 'Nenhum ativo cadastrado neste inventário.'}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-fogo-muted">Nenhum ativo encontrado com estes filtros.</p>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {layout === 'table' ? (
            <div className="min-w-0">
            <div
              className={cn(
                'overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface',
                tableFit == null && 'max-h-[min(560px,calc(100dvh-14rem))] overflow-y-auto',
              )}
            >
              <table ref={tableRef} className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-fogo-bg text-xs text-fogo-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-left">Região</th>
                    <th className="px-3 py-2 text-left">Endereço</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((asset) => (
                    <tr
                      key={asset.id}
                      className={cn(
                        'cursor-pointer border-t border-fogo-border/70',
                        active.id === asset.id ? 'bg-fogo-accent/10' : 'hover:bg-fogo-bg/70',
                      )}
                      onClick={() => selectAsset(asset.id)}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-fogo-text">{asset.name}</p>
                        <p className="text-[11px] text-fogo-accent">{asset.id}</p>
                      </td>
                      <td className="px-3 py-2 text-fogo-text">
                        {asset.category}
                        {asset.subtype ? <span className="block text-[10px] text-fogo-muted">{asset.subtype}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-fogo-text">{asset.region}</td>
                      <td className="max-w-[240px] px-3 py-2 text-xs text-fogo-muted">
                        {parseAssetLocation(asset.location) ? formatAssetAddress(parseAssetLocation(asset.location)!) : asset.address || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(asset.status)} className="capitalize">
                          {asset.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div ref={pagerRef}>
              <ListPager
                page={currentPage}
                totalPages={totalPages}
                from={filtered.length === 0 ? 0 : currentPage * pageSize + 1}
                to={Math.min(filtered.length, (currentPage + 1) * pageSize)}
                total={filtered.length}
                onPrev={() => setPage(currentPage - 1)}
                onNext={() => setPage(currentPage + 1)}
              />
            </div>
            </div>
          ) : (
            <div className="min-w-0">
            <div className="max-h-[min(560px,calc(100dvh-14rem))] overflow-auto pr-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
                {pageItems.map((asset) => (
                  <AssetInventoryCard
                    key={asset.id}
                    asset={asset}
                    selected={active.id === asset.id}
                    onSelect={() => selectAsset(asset.id)}
                  />
                ))}
              </div>
            </div>
            <ListPager
              page={currentPage}
              totalPages={totalPages}
              from={filtered.length === 0 ? 0 : currentPage * pageSize + 1}
              to={Math.min(filtered.length, (currentPage + 1) * pageSize)}
              total={filtered.length}
              onPrev={() => setPage(currentPage - 1)}
              onNext={() => setPage(currentPage + 1)}
            />
            </div>
          )}

          <aside
            ref={asideRef}
            className="xl:sticky xl:top-3 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto"
          >
            <OpsPanel title={active.name} subtitle={active.id} className="fogo-glass">
              <div className="space-y-4 p-3">
                <AssetInventoryHero asset={active} />
                <dl className="space-y-2 text-sm">
                  <DetailRow label="Categoria" value={active.category} />
                  <DetailRow label="Região" value={active.region} />
                  <DetailRow label="Patrimônio" value={active.patrimonyCode ?? '—'} />
                  <DetailRow label="Nº série" value={active.serialNumber ?? '—'} mono />
                  <DetailRow label="Fabricante" value={active.manufacturer ?? '—'} />
                  <DetailRow label="Modelo" value={active.model ?? '—'} />
                  <DetailRow label="Logradouro" value={activeLoc ? `${activeLoc.street}, ${activeLoc.number}` : active.address ?? '—'} />
                  <DetailRow label="Bairro" value={activeLoc?.neighborhood ?? '—'} />
                  <DetailRow label="Cidade" value={activeLoc ? `${activeLoc.city}/${activeLoc.uf}` : 'Marília/SP'} />
                  <DetailRow label="CEP" value={activeLoc?.cep ?? '—'} />
                  <DetailRow
                    label="Coordenada"
                    value={
                      activePoint
                        ? `${activePoint.lat.toFixed(5)}, ${activePoint.lng.toFixed(5)}`
                        : 'Sem coordenada gravada — o mapa não posiciona este ativo'
                    }
                    mono
                  />
                  <DetailRow label="Endereço" value={activeLoc ? formatAssetAddress(activeLoc) : active.address ?? '—'} />
                  <DetailRow
                    label="Situação cadastral"
                    value={CADASTRAL_LABELS[normalizeCadastral(active.cadastralStatus)]}
                  />
                  <DetailRow
                    label="Conectividade"
                    value={CONNECTIVITY_LABELS[deriveConnectivity(active)]}
                  />
                  <DetailRow label="Procedência" value={<DataOriginBadge origin={active.dataOrigin} />} />
                  {active.subtype ? <DetailRow label="Subtipo" value={active.subtype} /> : null}
                  {specDisplayRows(active.category, active.specs).map((row) => (
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  <DetailRow label="Patrimônio" value={active.patrimonyCode ?? '—'} />
                  <DetailRow label="Nº de série" value={active.serialNumber ?? '—'} />
                  <DetailRow label="Fabricante" value={active.manufacturer ?? '—'} />
                  <DetailRow label="Modelo" value={active.model ?? '—'} />
                  <DetailRow label="Criticidade" value={active.criticality ?? 'média'} />
                  <DetailRow label="Responsável (órgão)" value={active.responsibleOrg ?? '—'} />
                  <DetailRow label="Equipe resp." value={active.responsibleTeam ?? '—'} />
                  <DetailRow
                    label="Adquirido em"
                    value={active.acquiredAt ? formatDateTime(active.acquiredAt) : '—'}
                  />
                  <DetailRow
                    label="Última verificação"
                    value={active.lastVerifiedAt ? formatDateTime(active.lastVerifiedAt) : '—'}
                  />
                  <DetailRow
                    label="Situação operacional"
                    value={
                      <Badge variant={statusVariant(active.status)} className="capitalize">
                        {active.status}
                      </Badge>
                    }
                  />
                  <DetailRow label="Última comunicação" value={formatDateTime(active.lastSeen)} />
                </dl>
                <div className="flex flex-wrap gap-1">
                  <AssetTruthBadges asset={active} />
                </div>
                <Button size="sm" variant="primary" className="w-full" onClick={() => openDetail(active.id)}>
                  Detalhe
                </Button>
                {canManage ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!apiConnected}
                      onClick={() => {
                        setEditingAsset(active)
                        setEditorOpen(true)
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-fogo-critical"
                      disabled={!apiConnected}
                      onClick={() => void excludeAsset(active)}
                    >
                      Excluir
                    </Button>
                  </div>
                ) : null}
                {active.notes ? (
                  <p className="rounded-fogo-md border border-fogo-border bg-fogo-bg p-2.5 text-xs text-fogo-muted">
                    {active.notes}
                  </p>
                ) : null}
              </div>
            </OpsPanel>
          </aside>
        </div>
      )}
      <AssetCadastroModal open={editorOpen} asset={editingAsset} onClose={closeEditor} />
    </PageShell>
  )
}

function ListPager({
  page,
  totalPages,
  from,
  to,
  total,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  from: number
  to: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fogo-muted">
      <span>
        {from}–{to} de {total} · página {page + 1} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={onNext}>
          Próxima
        </Button>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-fogo-border/80 pb-2 last:border-0">
      <dt className="text-xs text-fogo-muted">{label}</dt>
      <dd className={cn('max-w-[200px] text-right text-xs font-medium text-fogo-text', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  )
}
