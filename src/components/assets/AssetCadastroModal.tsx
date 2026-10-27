import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { AssetCriticality, AssetStatus, CadastralStatus, UrbanAsset } from '@/types'
import { useOpsData } from '@/context/OpsDataContext'
import {
  categoryHasHardware,
  categoryHasInstalledAt,
  categoryHasOwnConnectivity,
  installedAtLabel,
  subtypesFor,
} from '@/lib/assetCatalog'
import { CADASTRAL_LABELS, CONNECTIVITY_LABELS, deriveConnectivity } from '@/lib/assetTruth'
import { CAMERA_RESOLUTIONS, sanitizeAssetSpecs, specKind } from '@/lib/assetSpecs'
import { isVehicleAsset } from '@/lib/assetLifecycle'
import { defaultLocationType } from '@/lib/mariliaGeo'
import { AssetAttachmentsPanel } from '@/components/assets/AssetAttachmentsPanel'
import {
  AssetLocationFields,
  emptyLocationForm,
  formToLocation,
  locationToForm,
  type LocationForm,
} from '@/components/assets/AssetLocationFields'
import {
  DEGRADATION_LABEL,
  DEGRADATION_LEVELS,
  PREVENTIVE_CYCLE_PRESETS,
  USEFUL_LIFE_MONTH_PRESETS,
  addDaysYmd,
  assessAssetLifecycle,
  isDegradationLevel,
  preventiveLabels,
} from '@/lib/assetLifecycle'

const REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Leste', 'Oeste']
const CUSTOM_CATEGORY = '__outro__'
const defaultCategory = (labels: string[]) => labels[0] ?? 'Câmera de vigilância'

type AssetForm = {
  id: string
  name: string
  category: string
  region: string
  status: AssetStatus
  health: number
  patrimonyCode: string
  serialNumber: string
  manufacturer: string
  model: string
  address: string
  cadastralStatus: CadastralStatus
  criticality: AssetCriticality
  responsibleOrg: string
  responsibleTeam: string
  notes: string
  subtype: string
  nightVision: '' | 'sim' | 'nao'
  resolution: string
  image: '' | 'colorida' | 'preto_e_branco'
  maxSpeedKmh: string
  acquiredAt: string
  installedAt: string
  lastVerifiedAt: string
  customCategory: string
  icmpEnabled: boolean
  icmpHost: string
  mqttEnabled: boolean
  mqttHost: string
  mqttPort: string
  mqttTls: boolean
  mqttTopics: string
  mqttClientId: string
  mqttUsername: string
  mqttPassword: string
  snmpEnabled: boolean
  snmpHost: string
  snmpPort: string
  snmpVersion: '2c' | '3'
  snmpOids: string
  snmpCommunity: string
  snmpUsername: string
  snmpAuthProtocol: string
  snmpPrivProtocol: string
  snmpAuthPassword: string
  snmpPrivPassword: string
  rtspEnabled: boolean
  rtspHost: string
  rtspPort: string
  rtspPath: string
  rtspUsername: string
  rtspPassword: string
  onvifEnabled: boolean
  onvifHost: string
  onvifPort: string
  onvifPath: string
  onvifTls: boolean
  onvifUsername: string
  onvifPassword: string
  maintenanceIntervalDays: string
  maintenanceNextDue: string
  maintenanceLastDone: string
  maintenancePlanNotes: string
  usefulLifeMonths: string
  degradationLevel: string
  cadastralJustification: string
}

function emptyForm(categoryDefault: string): AssetForm {
  return {
    id: '',
    name: '',
    category: categoryDefault,
    region: 'Centro',
    status: 'operacional',
    health: 100,
    patrimonyCode: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    address: '',
    cadastralStatus: 'operacional',
    criticality: 'média',
    responsibleOrg: '',
    responsibleTeam: '',
    notes: '',
    subtype: '',
    nightVision: '',
    resolution: '',
    image: '',
    maxSpeedKmh: '',
    acquiredAt: '',
    installedAt: '',
    lastVerifiedAt: '',
    customCategory: '',
    icmpEnabled: false,
    icmpHost: '',
    mqttEnabled: false,
    mqttHost: '',
    mqttPort: '',
    mqttTls: false,
    mqttTopics: '',
    mqttClientId: '',
    mqttUsername: '',
    mqttPassword: '',
    snmpEnabled: false,
    snmpHost: '',
    snmpPort: '',
    snmpVersion: '2c',
    snmpOids: '',
    snmpCommunity: '',
    snmpUsername: '',
    snmpAuthProtocol: 'SHA',
    snmpPrivProtocol: 'AES',
    snmpAuthPassword: '',
    snmpPrivPassword: '',
    rtspEnabled: false,
    rtspHost: '',
    rtspPort: '',
    rtspPath: '',
    rtspUsername: '',
    rtspPassword: '',
    onvifEnabled: false,
    onvifHost: '',
    onvifPort: '',
    onvifPath: '',
    onvifTls: false,
    onvifUsername: '',
    onvifPassword: '',
    maintenanceIntervalDays: '',
    maintenanceNextDue: '',
    maintenanceLastDone: '',
    maintenancePlanNotes: '',
    usefulLifeMonths: '',
    degradationLevel: '',
    cadastralJustification: '',
  }
}

function assetToForm(a: UrbanAsset): AssetForm {
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    region: a.region,
    status: a.status,
    health: a.health,
    patrimonyCode: a.patrimonyCode ?? '',
    serialNumber: a.serialNumber ?? '',
    manufacturer: a.manufacturer ?? '',
    model: a.model ?? '',
    address: a.address ?? '',
    cadastralStatus: a.cadastralStatus ?? 'operacional',
    criticality: a.criticality ?? 'média',
    responsibleOrg: a.responsibleOrg ?? '',
    responsibleTeam: a.responsibleTeam ?? '',
    notes: a.notes ?? '',
    subtype: a.subtype ?? '',
    nightVision: a.specs?.nightVision == null ? '' : a.specs.nightVision ? 'sim' : 'nao',
    resolution: a.specs?.resolution ?? '',
    image: a.specs?.image ?? '',
    maxSpeedKmh: a.specs?.maxSpeedKmh != null ? String(a.specs.maxSpeedKmh) : '',
    acquiredAt: (a.acquiredAt ?? '').slice(0, 10),
    installedAt: (a.installedAt ?? '').slice(0, 10),
    lastVerifiedAt: (a.lastVerifiedAt ?? '').slice(0, 10),
    customCategory: '',
    icmpEnabled: a.icmpEnabled === true,
    icmpHost: a.icmpHost ?? '',
    mqttEnabled: a.mqttEnabled === true,
    mqttHost: a.mqttHost ?? '',
    mqttPort: a.mqttPort != null ? String(a.mqttPort) : '',
    mqttTls: a.mqttTls === true,
    mqttTopics: a.mqttTopics ?? '',
    mqttClientId: a.mqttClientId ?? '',
    mqttUsername: a.mqttUsername ?? '',
    mqttPassword: '',
    snmpEnabled: a.snmpEnabled === true,
    snmpHost: a.snmpHost ?? '',
    snmpPort: a.snmpPort != null ? String(a.snmpPort) : '',
    snmpVersion: a.snmpVersion === '3' ? '3' : '2c',
    snmpOids: a.snmpOids ?? '',
    snmpCommunity: '',
    snmpUsername: a.snmpUsername ?? '',
    snmpAuthProtocol: a.snmpAuthProtocol === 'MD5' ? 'MD5' : 'SHA',
    snmpPrivProtocol: a.snmpPrivProtocol === 'DES' ? 'DES' : 'AES',
    snmpAuthPassword: '',
    snmpPrivPassword: '',
    rtspEnabled: a.rtspEnabled === true,
    rtspHost: a.rtspHost ?? '',
    rtspPort: a.rtspPort != null ? String(a.rtspPort) : '',
    rtspPath: a.rtspPath ?? '',
    rtspUsername: a.rtspUsername ?? '',
    rtspPassword: '',
    onvifEnabled: a.onvifEnabled === true,
    onvifHost: a.onvifHost ?? '',
    onvifPort: a.onvifPort != null ? String(a.onvifPort) : '',
    onvifPath: a.onvifPath ?? '',
    onvifTls: a.onvifTls === true,
    onvifUsername: a.onvifUsername ?? '',
    onvifPassword: '',
    maintenanceIntervalDays: a.maintenanceIntervalDays != null ? String(a.maintenanceIntervalDays) : '',
    maintenanceNextDue: (a.maintenanceNextDue ?? '').slice(0, 10),
    maintenanceLastDone: (a.maintenanceLastDone ?? '').slice(0, 10),
    maintenancePlanNotes: a.maintenancePlanNotes ?? '',
    usefulLifeMonths: a.usefulLifeMonths != null ? String(a.usefulLifeMonths) : '',
    degradationLevel: a.degradationLevel ?? '',
    cadastralJustification: '',
  }
}

function withPreventiveCycle(current: AssetForm, patch: Partial<AssetForm>): AssetForm {
  const next = { ...current, ...patch }
  const days = Number(next.maintenanceIntervalDays)
  if (next.maintenanceLastDone && Number.isFinite(days) && days > 0) {
    next.maintenanceNextDue = addDaysYmd(next.maintenanceLastDone, Math.floor(days))
  }
  return next
}

function dateOrUndef(v: string): string | undefined {
  return v.trim() ? v.trim() : undefined
}

export function AssetCadastroModal({
  open,
  asset,
  onClose,
}: {
  open: boolean
  asset: UrbanAsset | null
  onClose: () => void
}) {
  const { assets: urbanAssets, assetCategories, saveAsset, patchAsset, apiConnected } = useOpsData()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<AssetForm>(() => emptyForm(defaultCategory([])))
  const [locForm, setLocForm] = useState<LocationForm>(() => emptyLocationForm(defaultCategory([])))

  const categoryLabels = useMemo(() => {
    const fromApi = [...assetCategories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.label)
    const extra = urbanAssets.map((a) => a.category).filter((c) => !fromApi.includes(c))
    return [...fromApi, ...new Set(extra)]
  }, [assetCategories, urbanAssets])

  const openedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      openedFor.current = null
      return
    }
    const key = asset?.id ?? 'new'
    if (openedFor.current === key) return
    openedFor.current = key
    setFormError(null)
    if (asset) {
      setEditingId(asset.id)
      setForm(assetToForm(asset))
      setLocForm(locationToForm(asset.location, asset.category))
      return
    }
    const cat = defaultCategory(categoryLabels)
    setEditingId(null)
    setForm(emptyForm(cat))
    setLocForm(emptyLocationForm(cat))
  }, [open, asset, categoryLabels])

  function payloadFromForm() {
    const category = form.category === CUSTOM_CATEGORY ? form.customCategory.trim() : form.category
    return {
      name: form.name.trim(),
      category,
      region: form.region,
      id: form.id.trim() || undefined,
      status: form.status,
      health: form.health,
      patrimonyCode: form.patrimonyCode.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      model: form.model.trim() || undefined,
      address: form.address.trim() || undefined,
      cadastralStatus: form.cadastralStatus,
      criticality: form.criticality,
      responsibleOrg: form.responsibleOrg.trim() || undefined,
      responsibleTeam: form.responsibleTeam.trim() || undefined,
      notes: form.notes.trim() || undefined,
      subtype: form.subtype.trim() || undefined,
      specs: sanitizeAssetSpecs(category, {
        nightVision: form.nightVision === 'sim' ? true : form.nightVision === 'nao' ? false : undefined,
        resolution: form.resolution,
        image: form.image || undefined,
        maxSpeedKmh: form.maxSpeedKmh.trim() ? Number(form.maxSpeedKmh) : undefined,
      }) ?? null,
      acquiredAt: dateOrUndef(form.acquiredAt),
      installedAt: dateOrUndef(form.installedAt),
      lastVerifiedAt: dateOrUndef(form.lastVerifiedAt),
      location: formToLocation(locForm),
      icmpEnabled: categoryHasOwnConnectivity(category) ? form.icmpEnabled : false,
      icmpHost: categoryHasOwnConnectivity(category) && form.icmpEnabled ? form.icmpHost.trim() : '',
      mqttEnabled: categoryHasOwnConnectivity(category) ? form.mqttEnabled : false,
      mqttHost: categoryHasOwnConnectivity(category) && form.mqttEnabled ? form.mqttHost.trim() : '',
      mqttPort: form.mqttPort.trim(),
      mqttTls: form.mqttTls,
      mqttTopics: form.mqttTopics.trim(),
      mqttClientId: form.mqttClientId.trim(),
      mqttUsername: form.mqttUsername.trim(),
      mqttPassword: form.mqttPassword,
      snmpEnabled: categoryHasOwnConnectivity(category) ? form.snmpEnabled : false,
      snmpHost: categoryHasOwnConnectivity(category) && form.snmpEnabled ? form.snmpHost.trim() : '',
      snmpPort: form.snmpPort.trim(),
      snmpVersion: form.snmpVersion,
      snmpOids: form.snmpOids.trim(),
      snmpCommunity: form.snmpCommunity,
      snmpUsername: form.snmpUsername.trim(),
      snmpAuthProtocol: form.snmpAuthProtocol,
      snmpPrivProtocol: form.snmpPrivProtocol,
      snmpAuthPassword: form.snmpAuthPassword,
      snmpPrivPassword: form.snmpPrivPassword,
      rtspEnabled: categoryHasOwnConnectivity(category) ? form.rtspEnabled : false,
      rtspHost: categoryHasOwnConnectivity(category) && form.rtspEnabled ? form.rtspHost.trim() : '',
      rtspPort: form.rtspPort.trim(),
      rtspPath: form.rtspPath.trim(),
      rtspUsername: form.rtspUsername.trim(),
      rtspPassword: form.rtspPassword,
      onvifEnabled: categoryHasOwnConnectivity(category) ? form.onvifEnabled : false,
      onvifHost: categoryHasOwnConnectivity(category) && form.onvifEnabled ? form.onvifHost.trim() : '',
      onvifPort: form.onvifPort.trim(),
      onvifPath: form.onvifPath.trim(),
      onvifTls: form.onvifTls,
      onvifUsername: form.onvifUsername.trim(),
      onvifPassword: form.onvifPassword,
      maintenanceIntervalDays: (() => {
        const n = Number(form.maintenanceIntervalDays)
        return form.maintenanceIntervalDays.trim() && Number.isFinite(n) && n > 0 ? n : undefined
      })(),
      maintenanceNextDue: dateOrUndef(form.maintenanceNextDue),
      maintenanceLastDone: dateOrUndef(form.maintenanceLastDone),
      maintenancePlanNotes: form.maintenancePlanNotes.trim() || undefined,
      usefulLifeMonths: (() => {
        const n = Number(form.usefulLifeMonths)
        return form.usefulLifeMonths.trim() && Number.isFinite(n) && n > 0 ? n : undefined
      })(),
      degradationLevel: isDegradationLevel(form.degradationLevel) ? form.degradationLevel : undefined,
      cadastralJustification: form.cadastralJustification.trim() || undefined,
    }
  }

  async function submitAsset(e: React.FormEvent) {
    e.preventDefault()
    if (!apiConnected) return
    setSubmitting(true)
    setFormError(null)
    try {
      const payload = payloadFromForm()
      if (!payload.category) {
        setFormError('Informe a categoria do ativo.')
        setSubmitting(false)
        return
      }
      if (payload.icmpEnabled && !payload.icmpHost) {
        setFormError('Informe o IP ou o nome do host para o ping ICMP.')
        setSubmitting(false)
        return
      }
      if (payload.mqttEnabled && !payload.mqttHost) {
        setFormError('Informe o broker MQTT.')
        setSubmitting(false)
        return
      }
      if (payload.snmpEnabled && !payload.snmpHost) {
        setFormError('Informe o agente SNMP.')
        setSubmitting(false)
        return
      }
      const editing = editingId ? urbanAssets.find((a) => a.id === editingId) : undefined
      if (payload.snmpEnabled && payload.snmpVersion === '2c' && !payload.snmpCommunity.trim() && !editing?.snmpCommunitySet) {
        setFormError('Informe a comunidade SNMPv2c.')
        setSubmitting(false)
        return
      }
      if (payload.snmpEnabled && payload.snmpVersion === '3' && !payload.snmpUsername && !editing?.snmpUsername) {
        setFormError('Informe o usuário SNMPv3.')
        setSubmitting(false)
        return
      }
      if (payload.rtspEnabled && !payload.rtspHost) {
        setFormError('Informe o IP ou o nome da câmera RTSP.')
        setSubmitting(false)
        return
      }
      if (payload.onvifEnabled && !payload.onvifHost) {
        setFormError('Informe o IP ou o nome do equipamento ONVIF.')
        setSubmitting(false)
        return
      }
      if (editingId) {
        const original = urbanAssets.find((a) => a.id === editingId)
        if (original && (original.cadastralStatus ?? 'operacional') !== payload.cadastralStatus) {
          if (!payload.cadastralJustification || payload.cadastralJustification.length < 8) {
            setFormError('Justificativa obrigatória (mínimo 8 caracteres) ao alterar a situação cadastral.')
            setSubmitting(false)
            return
          }
        }
        await patchAsset(editingId, payload)
      } else {
        await saveAsset(payload)
      }
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  const formCategory = form.category === CUSTOM_CATEGORY ? form.customCategory || form.category : form.category
  const lifeLabels = preventiveLabels(formCategory)
  const cycleIsPreset =
    form.maintenanceIntervalDays === '' ||
    (PREVENTIVE_CYCLE_PRESETS as readonly number[]).includes(Number(form.maintenanceIntervalDays))
  const lifeIsPreset =
    form.usefulLifeMonths === '' ||
    (USEFUL_LIFE_MONTH_PRESETS as readonly number[]).includes(Number(form.usefulLifeMonths))
  const lifePreview = assessAssetLifecycle({
    id: form.id || 'NOVO',
    name: form.name || 'Ativo',
    category: formCategory,
    installedAt: form.installedAt || undefined,
    acquiredAt: form.acquiredAt || undefined,
    maintenanceIntervalDays: Number(form.maintenanceIntervalDays) || undefined,
    maintenanceNextDue: form.maintenanceNextDue || undefined,
    maintenanceLastDone: form.maintenanceLastDone || undefined,
    usefulLifeMonths: Number(form.usefulLifeMonths) || undefined,
    degradationLevel: isDegradationLevel(form.degradationLevel) ? form.degradationLevel : undefined,
  })

  return (
    <Modal open={open} onClose={onClose} title={editingId ? 'Editar ativo' : 'Cadastrar ativo'}>
        <form className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm" onSubmit={(e) => void submitAsset(e)}>
          <label className="block">
            <span className="text-fogo-muted">Nome</span>
            <input
              required
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          {!editingId ? (
            <label className="block">
              <span className="text-fogo-muted">ID (opcional)</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                placeholder="Auto CAM-/SEM-"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Categoria</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value
                  const subs = subtypesFor(category)
                  setForm((f) => ({
                    ...f,
                    category,
                    customCategory: category === CUSTOM_CATEGORY ? f.customCategory : '',
                    subtype: subs.includes(f.subtype) ? f.subtype : '',
                  }))
                  setLocForm((lf) => ({
                    ...lf,
                    locationType: lf.locationType || defaultLocationType(category),
                  }))
                }}
              >
                {categoryLabels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={CUSTOM_CATEGORY}>Outro recurso…</option>
              </select>
            </label>
            <label className="block">
              <span className="text-fogo-muted">Região</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {form.category === CUSTOM_CATEGORY ? (
            <label className="block">
              <span className="text-fogo-muted">Nome da categoria</span>
              <input
                required
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                placeholder="Ex.: Iluminação pública"
                value={form.customCategory}
                onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
              />
            </label>
          ) : null}
          {subtypesFor(form.category).length ? (
            <label className="block">
              <span className="text-fogo-muted">Subtipo</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.subtype}
                onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}
              >
                <option value="">Não informado</option>
                {[...new Set([form.subtype, ...subtypesFor(form.category)].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {specKind(form.category === CUSTOM_CATEGORY ? form.customCategory : form.category) === 'camera' ? (
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-fogo-muted">Visão noturna</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.nightVision}
                  onChange={(e) => setForm((f) => ({ ...f, nightVision: e.target.value as AssetForm['nightVision'] }))}
                >
                  <option value="">Não informado</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label className="block">
                <span className="text-fogo-muted">Resolução</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.resolution}
                  onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                >
                  <option value="">Não informada</option>
                  {[...new Set([form.resolution, ...CAMERA_RESOLUTIONS].filter(Boolean))].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-fogo-muted">Imagem</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value as AssetForm['image'] }))}
                >
                  <option value="">Não informada</option>
                  <option value="colorida">Colorida</option>
                  <option value="preto_e_branco">Preto e branco</option>
                </select>
              </label>
            </div>
          ) : null}
          {specKind(form.category === CUSTOM_CATEGORY ? form.customCategory : form.category) === 'radar' ? (
            <label className="block">
              <span className="text-fogo-muted">Velocidade máxima (km/h)</span>
              <input
                type="number"
                min={1}
                max={300}
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.maxSpeedKmh}
                onChange={(e) => setForm((f) => ({ ...f, maxSpeedKmh: e.target.value }))}
              />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Código patrimonial / identificador externo</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.patrimonyCode}
                onChange={(e) => setForm((f) => ({ ...f, patrimonyCode: e.target.value }))}
              />
            </label>
            {categoryHasHardware(form.category) ? (
              <label className="block">
                <span className="text-fogo-muted">{isVehicleAsset(form.category) ? 'Placa' : 'Nº série'}</span>
                <input
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                />
              </label>
            ) : null}
          </div>
          {categoryHasHardware(form.category) ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-fogo-muted">Fabricante / marca</span>
                <input
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.manufacturer}
                  onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-fogo-muted">Modelo</span>
                <input
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                />
              </label>
            </div>
          ) : null}
          <AssetLocationFields
            category={form.category === CUSTOM_CATEGORY ? form.customCategory : form.category}
            form={locForm}
            onChange={setLocForm}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Situação cadastral</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.cadastralStatus}
                onChange={(e) => setForm((f) => ({ ...f, cadastralStatus: e.target.value as CadastralStatus }))}
              >
                {(Object.keys(CADASTRAL_LABELS) as CadastralStatus[]).map((v) => (
                  <option key={v} value={v}>
                    {CADASTRAL_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            {editingId &&
            urbanAssets.find((a) => a.id === editingId)?.cadastralStatus !== form.cadastralStatus ? (
              <label className="col-span-2 block">
                <span className="text-fogo-muted">Justificativa da alteração cadastral</span>
                <textarea
                  required
                  minLength={8}
                  className="mt-1 min-h-[56px] w-full rounded-fogo-md border border-fogo-border px-2 py-1.5"
                  value={form.cadastralJustification}
                  onChange={(e) => setForm((f) => ({ ...f, cadastralJustification: e.target.value }))}
                  placeholder="Obrigatória ao mudar a situação cadastral. Não altera conectividade nem marca defeito por vencimento de manutenção."
                />
              </label>
            ) : null}
            {categoryHasOwnConnectivity(form.category) ? (
              <p className="self-end text-[11px] text-fogo-muted">
                Conectividade atual:{' '}
                {editingId
                  ? CONNECTIVITY_LABELS[
                      deriveConnectivity(
                        urbanAssets.find((a) => a.id === editingId) ?? {
                          lastSeen: '',
                          cadastralStatus: form.cadastralStatus,
                          category: form.category,
                        },
                      )
                    ]
                  : 'calculada após o cadastro'}
                . Não se altera ao corrigir o cadastro.
              </p>
            ) : (
              <p className="self-end text-[11px] text-fogo-muted">
                Conectividade própria não se aplica a esta categoria.
              </p>
            )}
          </div>
          {categoryHasOwnConnectivity(form.category) ? (
            <div className="rounded-fogo-md border border-fogo-border/80 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.icmpEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, icmpEnabled: e.target.checked }))}
                />
                <span>
                  Monitorar disponibilidade via ICMP
                  <span className="mt-0.5 block text-[11px] text-fogo-muted">
                    O FOGO pinga o host abaixo, inclusive no modo demonstração. Sem resposta, o CCO recebe alerta; quando o ping volta, o alerta é normalizado sozinho.
                  </span>
                </span>
              </label>
              {form.icmpEnabled ? (
                <label className="mt-2 block">
                  <span className="text-fogo-muted">Host ICMP (IP ou nome)</span>
                  <input
                    className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                    value={form.icmpHost}
                    onChange={(e) => setForm((f) => ({ ...f, icmpHost: e.target.value }))}
                    placeholder="10.20.0.41 ou camera01-marilia.prefeitura.gov.br"
                    required
                  />
                </label>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.mqttEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, mqttEnabled: e.target.checked }))}
                />
                <span>
                  Receber telemetria via MQTT
                  <span className="mt-0.5 block text-[11px] text-fogo-muted">
                    O mesmo conector MQTT do FOGO: broker, porta, TLS, tópicos e usuário. A senha fica no cofre.
                  </span>
                </span>
              </label>
              {form.mqttEnabled ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Broker</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.mqttHost}
                      onChange={(e) => setForm((f) => ({ ...f, mqttHost: e.target.value }))}
                      placeholder="10.20.0.20 ou broker.prefeitura.gov.br"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Porta</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.mqttPort}
                      onChange={(e) => setForm((f) => ({ ...f, mqttPort: e.target.value }))}
                      placeholder={form.mqttTls ? '8883' : '1883'}
                    />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.mqttTls}
                      onChange={(e) => setForm((f) => ({ ...f, mqttTls: e.target.checked }))}
                    />
                    TLS
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Tópicos</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.mqttTopics}
                      onChange={(e) => setForm((f) => ({ ...f, mqttTopics: e.target.value }))}
                      placeholder="marilia/centro/camera, marilia/sensores/#"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Client ID</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.mqttClientId}
                      onChange={(e) => setForm((f) => ({ ...f, mqttClientId: e.target.value }))}
                      placeholder="opcional"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Usuário</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.mqttUsername}
                      onChange={(e) => setForm((f) => ({ ...f, mqttUsername: e.target.value }))}
                      autoComplete="off"
                    />
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Senha {editingId && urbanAssets.find((a) => a.id === editingId)?.mqttPasswordSet ? '· já gravada no cofre' : ''}</span>
                    <input
                      type="password"
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.mqttPassword}
                      onChange={(e) => setForm((f) => ({ ...f, mqttPassword: e.target.value }))}
                      placeholder={editingId ? 'em branco mantém a senha atual' : ''}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.snmpEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, snmpEnabled: e.target.checked }))}
                />
                <span>
                  Consultar SNMP
                  <span className="mt-0.5 block text-[11px] text-fogo-muted">
                    O mesmo conector SNMP do FOGO. v2c consulta os OIDs informados. v3 guarda o usuário no cofre e aguarda homologação do equipamento.
                  </span>
                </span>
              </label>
              {form.snmpEnabled ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Agente (IP ou nome)</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.snmpHost}
                      onChange={(e) => setForm((f) => ({ ...f, snmpHost: e.target.value }))}
                      placeholder="10.20.0.41"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Porta</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.snmpPort}
                      onChange={(e) => setForm((f) => ({ ...f, snmpPort: e.target.value }))}
                      placeholder="161"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Versão</span>
                    <select
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                      value={form.snmpVersion}
                      onChange={(e) => setForm((f) => ({ ...f, snmpVersion: e.target.value === '3' ? '3' : '2c' }))}
                    >
                      <option value="2c">v2c</option>
                      <option value="3">v3</option>
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">OIDs</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.snmpOids}
                      onChange={(e) => setForm((f) => ({ ...f, snmpOids: e.target.value }))}
                      placeholder="1.3.6.1.2.1.1.1.0, 1.3.6.1.2.1.1.3.0"
                    />
                  </label>
                  {form.snmpVersion === '2c' ? (
                    <label className="col-span-2 block">
                      <span className="text-fogo-muted">
                        Comunidade {editingId && urbanAssets.find((a) => a.id === editingId)?.snmpCommunitySet ? '· já gravada no cofre' : ''}
                      </span>
                      <input
                        type="password"
                        className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                        value={form.snmpCommunity}
                        onChange={(e) => setForm((f) => ({ ...f, snmpCommunity: e.target.value }))}
                        placeholder={editingId ? 'em branco mantém a comunidade atual' : ''}
                        autoComplete="new-password"
                      />
                    </label>
                  ) : (
                    <>
                      <label className="block">
                        <span className="text-fogo-muted">Usuário v3</span>
                        <input
                          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                          value={form.snmpUsername}
                          onChange={(e) => setForm((f) => ({ ...f, snmpUsername: e.target.value }))}
                          autoComplete="off"
                        />
                      </label>
                      <label className="block">
                        <span className="text-fogo-muted">Autenticação</span>
                        <select
                          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                          value={form.snmpAuthProtocol}
                          onChange={(e) => setForm((f) => ({ ...f, snmpAuthProtocol: e.target.value }))}
                        >
                          <option value="SHA">SHA</option>
                          <option value="MD5">MD5</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-fogo-muted">Privacidade</span>
                        <select
                          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                          value={form.snmpPrivProtocol}
                          onChange={(e) => setForm((f) => ({ ...f, snmpPrivProtocol: e.target.value }))}
                        >
                          <option value="AES">AES</option>
                          <option value="DES">DES</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-fogo-muted">Senha de autenticação</span>
                        <input
                          type="password"
                          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                          value={form.snmpAuthPassword}
                          onChange={(e) => setForm((f) => ({ ...f, snmpAuthPassword: e.target.value }))}
                          placeholder="em branco mantém a atual"
                          autoComplete="new-password"
                        />
                      </label>
                      <label className="col-span-2 block">
                        <span className="text-fogo-muted">Senha de privacidade</span>
                        <input
                          type="password"
                          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                          value={form.snmpPrivPassword}
                          onChange={(e) => setForm((f) => ({ ...f, snmpPrivPassword: e.target.value }))}
                          placeholder="em branco mantém a atual"
                          autoComplete="new-password"
                        />
                      </label>
                    </>
                  )}
                </div>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.rtspEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, rtspEnabled: e.target.checked }))}
                />
                <span>
                  Consultar o endpoint de vídeo (RTSP)
                  <span className="mt-0.5 block text-[11px] text-fogo-muted">
                    O FOGO pergunta se o endereço responde (OPTIONS). Não abre o vídeo na parede de câmeras nem confirma o quadro.
                  </span>
                </span>
              </label>
              {form.rtspEnabled ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Host RTSP (IP ou nome)</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.rtspHost}
                      onChange={(e) => setForm((f) => ({ ...f, rtspHost: e.target.value }))}
                      placeholder="10.0.0.20"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Porta</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.rtspPort}
                      onChange={(e) => setForm((f) => ({ ...f, rtspPort: e.target.value }))}
                      placeholder="554"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Caminho</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.rtspPath}
                      onChange={(e) => setForm((f) => ({ ...f, rtspPath: e.target.value }))}
                      placeholder="/stream1"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Usuário</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.rtspUsername}
                      onChange={(e) => setForm((f) => ({ ...f, rtspUsername: e.target.value }))}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">
                      Senha {editingId && urbanAssets.find((a) => a.id === editingId)?.rtspPasswordSet ? '· já gravada no cofre' : ''}
                    </span>
                    <input
                      type="password"
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.rtspPassword}
                      onChange={(e) => setForm((f) => ({ ...f, rtspPassword: e.target.value }))}
                      placeholder={editingId ? 'em branco mantém a senha atual' : ''}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.onvifEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, onvifEnabled: e.target.checked }))}
                />
                <span>
                  Consultar o gerenciamento do equipamento (ONVIF)
                  <span className="mt-0.5 block text-[11px] text-fogo-muted">
                    O FOGO pergunta data, fabricante e modelo pelo serviço de dispositivo. Não abre o fluxo de vídeo.
                  </span>
                </span>
              </label>
              {form.onvifEnabled ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Host ONVIF (IP ou nome)</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.onvifHost}
                      onChange={(e) => setForm((f) => ({ ...f, onvifHost: e.target.value }))}
                      placeholder="10.0.0.20"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Porta</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.onvifPort}
                      onChange={(e) => setForm((f) => ({ ...f, onvifPort: e.target.value }))}
                      placeholder="80"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.onvifTls}
                      onChange={(e) => setForm((f) => ({ ...f, onvifTls: e.target.checked }))}
                    />
                    HTTPS
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-fogo-muted">Caminho do serviço</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-sm"
                      value={form.onvifPath}
                      onChange={(e) => setForm((f) => ({ ...f, onvifPath: e.target.value }))}
                      placeholder="/onvif/device_service"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">Usuário</span>
                    <input
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.onvifUsername}
                      onChange={(e) => setForm((f) => ({ ...f, onvifUsername: e.target.value }))}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="text-fogo-muted">
                      Senha {editingId && urbanAssets.find((a) => a.id === editingId)?.onvifPasswordSet ? '· já gravada no cofre' : ''}
                    </span>
                    <input
                      type="password"
                      className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 text-sm"
                      value={form.onvifPassword}
                      onChange={(e) => setForm((f) => ({ ...f, onvifPassword: e.target.value }))}
                      placeholder={editingId ? 'em branco mantém a senha atual' : ''}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Criticidade</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.criticality}
                onChange={(e) => setForm((f) => ({ ...f, criticality: e.target.value as AssetCriticality }))}
              >
                {(['baixa', 'média', 'alta', 'crítica'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-fogo-muted">Estado operacional</span>
              <select
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AssetStatus }))}
              >
                <option value="operacional">operacional</option>
                <option value="alerta">alerta</option>
                <option value="inativo">inativo</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Órgão responsável</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.responsibleOrg}
                onChange={(e) => setForm((f) => ({ ...f, responsibleOrg: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-fogo-muted">Unidade / equipe responsável</span>
              <input
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.responsibleTeam}
                onChange={(e) => setForm((f) => ({ ...f, responsibleTeam: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-fogo-muted">Data de aquisição</span>
              <input
                type="date"
                className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                value={form.acquiredAt}
                onChange={(e) => setForm((f) => ({ ...f, acquiredAt: e.target.value }))}
              />
            </label>
            {categoryHasInstalledAt(form.category) ? (
              <label className="block">
                <span className="text-fogo-muted">{installedAtLabel(form.category)}</span>
                <input
                  type="date"
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.installedAt}
                  onChange={(e) => setForm((f) => ({ ...f, installedAt: e.target.value }))}
                />
              </label>
            ) : null}
          </div>
          <div className="rounded-fogo-md border border-fogo-border/80 p-3">
            <p className="text-xs font-medium text-fogo-text">{lifeLabels.plan}</p>
            <p className="mt-0.5 text-[11px] text-fogo-muted">
              Opcional. Ativos sem esses dados ficam de fora das análises de ciclo e vida útil. O vencimento gera aviso
              e não marca defeito sozinho.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-fogo-muted">{lifeLabels.cycle}</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={cycleIsPreset ? form.maintenanceIntervalDays : '__custom__'}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setForm((f) => withPreventiveCycle(f, { maintenanceIntervalDays: f.maintenanceIntervalDays || '75' }))
                      return
                    }
                    setForm((f) => withPreventiveCycle(f, { maintenanceIntervalDays: v }))
                  }}
                >
                  <option value="">Não cadastrado</option>
                  {PREVENTIVE_CYCLE_PRESETS.map((d) => (
                    <option key={d} value={d}>
                      a cada {d} dias
                    </option>
                  ))}
                  <option value="__custom__">Outro intervalo</option>
                </select>
              </label>
              {!cycleIsPreset ? (
                <label className="block">
                  <span className="text-fogo-muted">Intervalo (dias)</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                    value={form.maintenanceIntervalDays}
                    onChange={(e) => setForm((f) => withPreventiveCycle(f, { maintenanceIntervalDays: e.target.value }))}
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="text-fogo-muted">{lifeLabels.last}</span>
                  <input
                    type="date"
                    className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                    value={form.maintenanceLastDone}
                    onChange={(e) => setForm((f) => withPreventiveCycle(f, { maintenanceLastDone: e.target.value }))}
                  />
                </label>
              )}
              {!cycleIsPreset ? (
                <label className="block">
                  <span className="text-fogo-muted">{lifeLabels.last}</span>
                  <input
                    type="date"
                    className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                    value={form.maintenanceLastDone}
                    onChange={(e) => setForm((f) => withPreventiveCycle(f, { maintenanceLastDone: e.target.value }))}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-fogo-muted">{lifeLabels.next}</span>
                <input
                  type="date"
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.maintenanceNextDue}
                  onChange={(e) => setForm((f) => ({ ...f, maintenanceNextDue: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-fogo-muted">{lifeLabels.usefulLife} (meses)</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={lifeIsPreset ? form.usefulLifeMonths : '__custom__'}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => ({
                      ...f,
                      usefulLifeMonths: v === '__custom__' ? f.usefulLifeMonths || '72' : v,
                    }))
                  }}
                >
                  <option value="">Não cadastrada</option>
                  {USEFUL_LIFE_MONTH_PRESETS.map((m) => (
                    <option key={m} value={m}>
                      {m} meses ({Math.round(m / 12)} anos)
                    </option>
                  ))}
                  <option value="__custom__">Outro período</option>
                </select>
              </label>
              {!lifeIsPreset ? (
                <label className="block">
                  <span className="text-fogo-muted">Meses de vida útil</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                    value={form.usefulLifeMonths}
                    onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-fogo-muted">Nível de degradação</span>
                <select
                  className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
                  value={form.degradationLevel}
                  onChange={(e) => setForm((f) => ({ ...f, degradationLevel: e.target.value }))}
                >
                  <option value="">Calcular automaticamente</option>
                  {DEGRADATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {DEGRADATION_LABEL[level]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-2 block">
              <span className="text-fogo-muted">Notas do plano</span>
              <textarea
                className="mt-1 min-h-[48px] w-full rounded-fogo-md border border-fogo-border px-2 py-1.5"
                value={form.maintenancePlanNotes}
                onChange={(e) => setForm((f) => ({ ...f, maintenancePlanNotes: e.target.value }))}
              />
            </label>
            {lifePreview ? (
              <p className="mt-2 text-[11px] text-fogo-muted">
                Estimativa com os dados atuais: degradação {DEGRADATION_LABEL[lifePreview.degradation].toLowerCase()}
                {lifePreview.overdueDays ? ` · ${lifePreview.overdueDays} dia(s) de atraso` : ''}
                {` · indisponibilidade ${Math.round(lifePreview.unavailabilityRisk * 100)}%`}
                {` · acidentes ${Math.round(lifePreview.accidentRisk * 100)}%`}.
              </p>
            ) : null}
          </div>
          <label className="block">
            <span className="text-fogo-muted">Data da última verificação</span>
            <input
              type="date"
              className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.lastVerifiedAt}
              onChange={(e) => setForm((f) => ({ ...f, lastVerifiedAt: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-fogo-muted">Observações</span>
            <textarea
              className="mt-1 min-h-[60px] w-full rounded-fogo-md border border-fogo-border px-2 py-1.5"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          {editingId ? (
            <div className="rounded-fogo-md border border-fogo-border/80 p-3">
              <AssetAttachmentsPanel assetId={editingId} />
            </div>
          ) : (
            <p className="text-[11px] text-fogo-muted">Anexos (manual, certificado, foto) ficam disponíveis após salvar o cadastro.</p>
          )}
          {formError ? <p className="text-xs text-fogo-critical">{formError}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>

    </Modal>
  )
}
