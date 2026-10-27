import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Drawer } from '@/components/ui/Drawer'
import { OpsTabBar } from '@/components/layout/OpsTabBar'
import { Badge, statusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CameraFeedImage } from '@/components/cameras/CameraFeedImage'
import { DataOriginBadge } from '@/components/ops/DataOriginBadge'
import { useOpsData } from '@/context/OpsDataContext'
import { useAssetDossier } from '@/hooks/useAssetDossier'
import { fetchAssetHistory, fetchTelemetry } from '@/lib/api'
import {
  CADASTRAL_LABELS,
  CONNECTIVITY_LABELS,
  cadastralTone,
  connectivityTone,
  deriveConnectivity,
  normalizeCadastral,
} from '@/lib/assetTruth'
import { specDisplayRows } from '@/lib/assetSpecs'
import { cameraFeedsFromAssets, isCameraAsset } from '@/lib/cameraFeedsFromAssets'
import { formatAssetAddress, resolveAssetLocation } from '@/lib/mariliaAddresses'
import {
  COORD_ORIGIN_LABELS,
  LOCATION_TYPE_LABELS,
  REFERENCE_KIND_LABELS,
} from '@/lib/mariliaGeo'
import { formatDatePtBr, formatDateTime } from '@/lib/format'
import { assessAssetLifecycle, DEGRADATION_LABEL, preventiveLabels } from '@/lib/assetLifecycle'
import { ROUTES } from '@/lib/routes'
import { stripCityPrefix } from '@/lib/tenant'
import { useCityHref } from '@/context/TenantContext'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { AssetAttachmentsPanel } from '@/components/assets/AssetAttachmentsPanel'
import {
  categoryHasHardware,
  categoryHasInstalledAt,
  categoryHasOwnConnectivity,
  installedAtLabel,
} from '@/lib/assetCatalog'
import type { AssetHistoryEntry, TelemetryEvent } from '@/types'
import { cn } from '@/lib/cn'
import { alertHeadline } from '@/lib/alertCopy'

type Tab = 'cadastro' | 'monitoramento' | 'historico' | 'eventos'

export function AssetDossierHost() {
  const { assetId, closeAsset } = useAssetDossier()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const { assets } = useOpsData()
  const onInventory = stripCityPrefix(pathname) === ROUTES.cityInventory
  const dossierId = assetId && (!onInventory || params.get('ficha') === '1') ? assetId : null
  const asset = assets.find((a) => a.id === dossierId) ?? null
  return <AssetDossierDrawer assetId={dossierId} asset={asset} onClose={closeAsset} />
}

function AssetDossierDrawer({
  assetId,
  asset,
  onClose,
}: {
  assetId: string | null
  asset: ReturnType<typeof useOpsData>['assets'][number] | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const href = useCityHref()
  const { alerts, incidents, apiConnected, removeAsset } = useOpsData()
  const { can } = useCcoAccess()
  const [tab, setTab] = useState<Tab>('cadastro')
  const [history, setHistory] = useState<AssetHistoryEntry[]>([])
  const [events, setEvents] = useState<TelemetryEvent[]>([])

  useEffect(() => {
    setTab('cadastro')
  }, [assetId])

  useEffect(() => {
    if (!assetId || !apiConnected) return
    if (tab === 'historico') {
      void fetchAssetHistory(assetId).then(setHistory).catch(() => setHistory([]))
    }
    if (tab === 'eventos' || tab === 'monitoramento') {
      void fetchTelemetry({ assetId, limit: 40 })
        .then(setEvents)
        .catch(() => setEvents([]))
    }
  }, [assetId, tab, apiConnected])

  const cad = normalizeCadastral(asset?.cadastralStatus)
  const conn = asset ? deriveConnectivity(asset) : 'desconhecido'
  const relatedAlerts = useMemo(
    () =>
      alerts.filter(
        (a) => a.relatedAssetId === assetId && a.state !== 'resolvido' && a.state !== 'falso positivo' && a.state !== 'os_aberta',
      ),
    [alerts, assetId],
  )
  const relatedIncidents = useMemo(
    () => incidents.filter((i) => i.relatedAssetId === assetId && i.status !== 'resolvida' && i.status !== 'cancelada'),
    [incidents, assetId],
  )
  const camera = asset && isCameraAsset(asset) ? cameraFeedsFromAssets([asset])[0] : null
  const loc = asset ? resolveAssetLocation(asset) : null
  const life = asset ? assessAssetLifecycle(asset) : null
  const lifeLabels = asset ? preventiveLabels(asset.category) : null

  if (!assetId) return null

  return (
    <Drawer
      open
      onClose={onClose}
      width="xl"
      title={asset?.name ?? assetId}
      subtitle={`${assetId} · registro único do inventário`}
    >
      {!asset ? (
        <p className="text-sm text-fogo-muted">Ativo não encontrado neste CCO.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={cadastralTone(cad)}>{CADASTRAL_LABELS[cad]}</Badge>
            <Badge variant={connectivityTone(conn)}>{CONNECTIVITY_LABELS[conn]}</Badge>
            <Badge variant={statusVariant(asset.status)}>Operação: {asset.status}</Badge>
            <DataOriginBadge origin={asset.dataOrigin} />
          </div>
          <p className="text-[11px] text-fogo-muted">
            Situação cadastral e conectividade são independentes. Um ativo operacional no cadastro pode estar sem
            comunicação recente.
          </p>

          <OpsTabBar aria-label="Abas do dossiê do ativo">
            {(['cadastro', 'monitoramento', 'historico', 'eventos'] as Tab[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? 'primary' : 'outline'}
                className="shrink-0 whitespace-nowrap"
                onClick={() => setTab(id)}
              >
                {id === 'cadastro'
                  ? 'Cadastro'
                  : id === 'monitoramento'
                    ? 'Monitoramento'
                    : id === 'historico'
                      ? 'Histórico'
                      : 'Eventos'}
              </Button>
            ))}
          </OpsTabBar>

          {tab === 'cadastro' ? (
            <dl className="space-y-2 text-xs">
              <Row label="Identificador interno" value={asset.id} mono />
              <Row label="Categoria" value={asset.category} />
              {asset.subtype ? <Row label="Subtipo" value={asset.subtype} /> : null}
              <Row label="Situação cadastral" value={CADASTRAL_LABELS[cad]} />
              <Row label="Situação operacional" value={asset.status} />
              {categoryHasOwnConnectivity(asset.category) ? (
                <Row label="Conectividade (tempo real)" value={CONNECTIVITY_LABELS[conn]} />
              ) : (
                <Row label="Conectividade" value="Não aplicável a esta categoria" />
              )}
              {categoryHasOwnConnectivity(asset.category) ? (
                <>
                  <Row
                    label="ICMP"
                    value={
                      asset.icmpEnabled
                        ? `Ping ativo · ${asset.icmpHost || 'host não informado'}`
                        : 'Desligado'
                    }
                  />
                  <Row
                    label="MQTT"
                    value={asset.mqttEnabled ? `Ativo · ${asset.mqttHost || 'broker não informado'}` : 'Desligado'}
                  />
                  <Row
                    label="SNMP"
                    value={
                      asset.snmpEnabled
                        ? `v${asset.snmpVersion === '3' ? '3' : '2c'} · ${asset.snmpHost || 'agente não informado'}`
                        : 'Desligado'
                    }
                  />
                  <Row
                    label="RTSP"
                    value={
                      asset.rtspEnabled
                        ? `Consulta do endpoint · ${asset.rtspHost || 'host não informado'} · ${probeLine(asset.rtspHealth, asset.rtspLastError, asset.rtspLastAttemptAt)}`
                        : 'Desligado'
                    }
                  />
                  <Row
                    label="ONVIF"
                    value={
                      asset.onvifEnabled
                        ? `Gerenciamento · ${asset.onvifHost || 'host não informado'} · ${probeLine(asset.onvifHealth, asset.onvifLastError, asset.onvifLastAttemptAt)}`
                        : 'Desligado'
                    }
                  />
                </>
              ) : null}
              <Row label="Patrimônio / identificador externo" value={asset.patrimonyCode ?? '—'} />
              {categoryHasHardware(asset.category) ? (
                <>
                  <Row label="Nº de série" value={asset.serialNumber ?? '—'} mono />
                  <Row label="Fabricante / marca" value={asset.manufacturer ?? '—'} />
                  <Row label="Modelo" value={asset.model ?? '—'} />
                </>
              ) : null}
              {specDisplayRows(asset.category, asset.specs).map((row) => (
                <Row key={row.label} label={row.label} value={row.value} />
              ))}
              <Row label="Logradouro" value={loc ? `${loc.street}, ${loc.number}` : asset.address ?? '—'} />
              <Row label="Bairro" value={loc?.neighborhood ?? '—'} />
              <Row label="Cidade / UF" value={loc ? `${loc.city}/${loc.uf}` : 'Marília/SP'} />
              <Row label="CEP" value={loc?.cep ?? '—'} mono />
              {loc?.referenceKind ? (
                <Row label="Tipo de referência" value={REFERENCE_KIND_LABELS[loc.referenceKind] ?? loc.referenceKind} />
              ) : null}
              {loc?.reference ? <Row label="Referência" value={loc.reference} /> : null}
              <Row label="Endereço completo" value={loc ? formatAssetAddress(loc) : asset.address ?? '—'} />
              {loc?.lat != null && loc.lng != null ? (
                <Row label="Coordenada (WGS84)" value={`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`} mono />
              ) : null}
              {loc?.lat != null && loc.numberConfirmed === false ? (
                <Row label="Posição no mapa" value="Posição da rua, número não confirmado." />
              ) : null}
              {loc?.coordOrigin ? (
                <Row label="Origem da coordenada" value={COORD_ORIGIN_LABELS[loc.coordOrigin] ?? loc.coordOrigin} />
              ) : null}
              {loc?.coordPrecisionM != null ? <Row label="Precisão" value={`${loc.coordPrecisionM} m`} /> : null}
              {loc?.locationType ? (
                <Row label="Tipo de localização" value={LOCATION_TYPE_LABELS[loc.locationType] ?? loc.locationType} />
              ) : null}
              {loc?.locationValidatedAt ? (
                <Row label="Localização validada em" value={formatDateTime(loc.locationValidatedAt)} />
              ) : null}
              {asset.liveLocation ? (
                <Row
                  label="Posição corrente (evento)"
                  value={`${asset.liveLocation.lat.toFixed(6)}, ${asset.liveLocation.lng.toFixed(6)} · ${formatDateTime(asset.liveLocation.recordedAt)}`}
                  mono
                />
              ) : null}
              <Row label="Região operacional" value={asset.region} />
              <Row label="Órgão responsável" value={asset.responsibleOrg ?? '—'} />
              <Row label="Unidade / equipe responsável" value={asset.responsibleTeam ?? '—'} />
              <Row label="Criticidade operacional" value={asset.criticality ?? 'média'} />
              <Row label="Adquirido em" value={asset.acquiredAt ? formatDateTime(asset.acquiredAt) : '—'} />
              {categoryHasInstalledAt(asset.category) ? (
                <Row
                  label={installedAtLabel(asset.category)}
                  value={asset.installedAt ? formatDateTime(asset.installedAt) : '—'}
                />
              ) : null}
              <Row
                label="Última verificação"
                value={asset.lastVerifiedAt ? formatDateTime(asset.lastVerifiedAt) : '—'}
              />
              {asset.notes ? <Row label="Observações" value={asset.notes} /> : null}
              {lifeLabels && (life || asset.maintenanceIntervalDays || asset.usefulLifeMonths || asset.degradationLevel) ? (
                <>
                  <Row
                    label={lifeLabels.cycle}
                    value={
                      asset.maintenanceIntervalDays
                        ? `a cada ${asset.maintenanceIntervalDays} dias`
                        : 'não cadastrado'
                    }
                  />
                  <Row
                    label={lifeLabels.last}
                    value={asset.maintenanceLastDone ? formatDatePtBr(asset.maintenanceLastDone) : '—'}
                  />
                  <Row
                    label={lifeLabels.next}
                    value={life?.dueOn ? formatDatePtBr(life.dueOn) : '—'}
                  />
                  <Row
                    label={lifeLabels.usefulLife}
                    value={
                      asset.usefulLifeMonths
                        ? `${asset.usefulLifeMonths} meses${life?.usefulLifeEnd ? ` · fim ${formatDatePtBr(life.usefulLifeEnd)}` : ''}`
                        : 'não cadastrada'
                    }
                  />
                  <Row
                    label="Degradação"
                    value={
                      life
                        ? `${DEGRADATION_LABEL[life.degradation]}${life.informedDegradation ? '' : ' (estimada)'}`
                        : '—'
                    }
                  />
                  {life ? (
                    <Row
                      label="Risco estimado"
                      value={`indisponibilidade ${Math.round(life.unavailabilityRisk * 100)}% · acidentes ${Math.round(life.accidentRisk * 100)}%`}
                    />
                  ) : null}
                  {life?.overdueDays ? (
                    <Row label="Atraso da preventiva" value={`${life.overdueDays} dia(s)`} />
                  ) : null}
                  {asset.maintenancePlanNotes ? <Row label="Notas do plano" value={asset.maintenancePlanNotes} /> : null}
                  <p className="text-[11px] text-fogo-muted">
                    Percentuais vêm do ciclo e da vida útil cadastrados. Não são telemetria de falha e não alteram a
                    situação cadastral sozinhos.
                  </p>
                </>
              ) : null}
              <Row label="Criado em" value={asset.createdAt ? formatDateTime(asset.createdAt) : '—'} />
              <Row label="Criado por" value={asset.createdBy ?? '—'} />
              <Row label="Atualizado em" value={asset.updatedAt ? formatDateTime(asset.updatedAt) : '—'} />
              <Row label="Atualizado por" value={asset.updatedBy ?? '—'} />
            </dl>
          ) : null}
          {tab === 'cadastro' && asset ? (
            <div className="pt-1">
              <AssetAttachmentsPanel assetId={asset.id} />
            </div>
          ) : null}

          {tab === 'monitoramento' ? (
            <div className="space-y-3">
              <p className="text-xs text-fogo-muted">Monitoramento específico deste equipamento — mesma fonte do CCO.</p>
              {camera ? (
                <CameraFeedImage
                  camera={camera}
                  className="aspect-video max-h-[180px] rounded-fogo-md border border-fogo-border"
                />
              ) : null}
              <dl className="space-y-2 text-xs">
                <Row label="Última comunicação" value={formatDateTime(asset.lastSeen)} />
                <Row label="Saúde" value={`${asset.health}%`} />
                <Row label="Conectividade" value={CONNECTIVITY_LABELS[conn]} />
                {camera ? <Row label="Fluxo de vídeo" value={camera.status} /> : null}
                {asset.category.toLowerCase().includes('radar') ? (
                  <Row label="Leitura / verificação" value={events[0] ? formatDateTime(events[0].occurredAt) : 'sem leitura recente'} />
                ) : null}
                {asset.category.toLowerCase().includes('sensor') ? (
                  <Row label="Último sinal" value={events[0]?.eventType ?? 'aguardando telemetria'} />
                ) : null}
                {asset.category.toLowerCase().includes('totem') ? (
                  <Row label="Estado do totem" value={conn === 'conectado' ? 'em operação' : CONNECTIVITY_LABELS[conn]} />
                ) : null}
              </dl>
              <p className="text-xs font-medium">Alertas abertos neste ativo</p>
              {relatedAlerts.length === 0 ? (
                <p className="text-xs text-fogo-muted">Nenhum alerta aberto.</p>
              ) : (
                <ul className="space-y-1">
                  {relatedAlerts.map((a) => (
                    <li key={a.id} className="rounded-fogo-md border border-fogo-border px-2 py-1.5 text-xs">
                      <span className="font-mono text-fogo-accent">{a.id}</span> · {alertHeadline(a.title)}
                      <DataOriginBadge origin={a.dataOrigin} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs font-medium">Ordens de serviço</p>
              {relatedIncidents.length === 0 ? (
                <p className="text-xs text-fogo-muted">Nenhuma OS aberta neste ativo.</p>
              ) : (
                relatedIncidents.map((i) => (
                  <p key={i.id} className="text-xs">
                    {i.id} · {i.type} · {i.status}
                  </p>
                ))
              )}
            </div>
          ) : null}

          {tab === 'historico' ? (
            <div className="space-y-2">
              <p className="text-xs text-fogo-muted">
                Correção de cadastro não apaga eventos operacionais. Aqui só entram mudanças de cadastro (autor e
                valores).
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-fogo-muted">Nenhuma alteração cadastral registrada ainda.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="rounded-fogo-md border border-fogo-border px-2 py-2 text-xs">
                    <p className="font-medium">
                      {h.action === 'created' ? 'Cadastro criado' : 'Cadastro alterado'} · {h.actorLabel}
                    </p>
                    <p className="text-fogo-muted">{formatDateTime(h.changedAt)}</p>
                    {h.changedFields.length ? (
                      <ul className="mt-1 space-y-0.5 text-fogo-muted">
                        {h.changedFields.map((field) => (
                          <li key={field}>
                            <span className="text-fogo-text">{field}</span>
                            {h.before || h.after ? (
                              <>
                                : {formatHistValue(h.before?.[field])} → {formatHistValue(h.after?.[field])}
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === 'eventos' ? (
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-xs text-fogo-muted">Sem eventos de telemetria para este ativo.</p>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="rounded-fogo-md border border-fogo-border px-2 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-medium">{ev.eventType}</span>
                      <DataOriginBadge origin={ev.dataOrigin} />
                    </div>
                    <p className="text-fogo-muted">Ocorrido {formatDateTime(ev.occurredAt)}</p>
                    {ev.receivedAt ? <p className="text-fogo-muted">Recebido {formatDateTime(ev.receivedAt)}</p> : null}
                    {ev.quality ? <p className="text-fogo-muted">Qualidade: {ev.quality}</p> : null}
                    <p className="text-fogo-muted">Fonte: {ev.source}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 pt-2">
            {can('assets', 'manage') ? (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`${href(ROUTES.cityInventory)}?ativo=${encodeURIComponent(asset.id)}&editar=1`)}
                >
                  Editar cadastro
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-fogo-critical"
                  onClick={() =>
                    void removeAsset(asset.id).then(() => {
                      onClose()
                    })
                  }
                >
                  Remover ativo
                </Button>
              </>
            ) : null}
            {relatedAlerts[0] ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`${href(ROUTES.alerts)}?q=${encodeURIComponent(relatedAlerts[0]!.id)}`)}
              >
                Ver alertas do ativo
              </Button>
            ) : null}
            <Button variant="outline" className="w-full" onClick={() => navigate(`${href(ROUTES.cityInventory)}?ativo=${encodeURIComponent(asset.id)}`)}>
              Ver no mapa
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function formatHistValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function probeLine(health?: string, lastError?: string, lastAttempt?: string) {
  if (!lastAttempt) return 'ainda sem consulta ao equipamento'
  if (health === 'healthy') return 'última consulta ao equipamento ok'
  return lastError ? `última consulta falhou · ${lastError}` : 'última consulta sem sucesso'
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-fogo-muted">{label}</dt>
      <dd className={cn('text-right', mono && 'font-mono text-fogo-accent')}>{value}</dd>
    </div>
  )
}
