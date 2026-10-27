import { useEffect, useRef, useState } from 'react'
import { MariliaCityMap } from '@/components/maps/MariliaCityMap'
import { categoryToMarkerKind } from '@/lib/markerKind'
import { Button } from '@/components/ui/Button'
import {
  COORD_ORIGIN_LABELS,
  LOCATION_TYPE_LABELS,
  REFERENCE_KIND_LABELS,
  defaultLocationType,
  roundCoord,
  type CoordOrigin,
  type LocationReferenceKind,
  type LocationType,
} from '@/lib/mariliaGeo'
import { suggestAssetLocation, type GeoSuggestion } from '@/lib/api'
import type { AssetLocation } from '@/types'

export type LocationForm = {
  cep: string
  neighborhood: string
  city: string
  uf: string
  street: string
  number: string
  reference: string
  referenceKind: LocationReferenceKind | ''
  lat: string
  lng: string
  coordOrigin: CoordOrigin | ''
  coordPrecisionM: string
  locationType: LocationType | ''
  locationValidatedAt: string
  numberConfirmed: boolean | ''
}

export function emptyLocationForm(category: string): LocationForm {
  return {
    cep: '',
    neighborhood: '',
    city: 'Marília',
    uf: 'SP',
    street: '',
    number: '',
    reference: '',
    referenceKind: 'numero',
    lat: '',
    lng: '',
    coordOrigin: '',
    coordPrecisionM: '',
    locationType: defaultLocationType(category),
    locationValidatedAt: '',
    numberConfirmed: '',
  }
}

export function locationToForm(loc: AssetLocation | undefined, category: string): LocationForm {
  if (!loc) return emptyLocationForm(category)
  return {
    cep: loc.cep ?? '',
    neighborhood: loc.neighborhood ?? '',
    city: loc.city || 'Marília',
    uf: loc.uf || 'SP',
    street: loc.street ?? '',
    number: loc.number ?? '',
    reference: loc.reference ?? '',
    referenceKind: loc.referenceKind ?? 'numero',
    lat: loc.lat != null ? String(loc.lat) : '',
    lng: loc.lng != null ? String(loc.lng) : '',
    coordOrigin: loc.coordOrigin ?? '',
    coordPrecisionM: loc.coordPrecisionM != null ? String(loc.coordPrecisionM) : '',
    locationType: loc.locationType ?? defaultLocationType(category),
    locationValidatedAt: (loc.locationValidatedAt ?? '').slice(0, 10),
    numberConfirmed: loc.numberConfirmed === true ? true : loc.numberConfirmed === false ? false : '',
  }
}

export function formToLocation(form: LocationForm): AssetLocation {
  const lat = form.lat.trim() ? Number(form.lat) : undefined
  const lng = form.lng.trim() ? Number(form.lng) : undefined
  return {
    cep: form.cep.trim(),
    neighborhood: form.neighborhood.trim(),
    city: form.city.trim() || 'Marília',
    uf: form.uf.trim() || 'SP',
    street: form.street.trim(),
    number: form.number.trim(),
    reference: form.reference.trim() || undefined,
    referenceKind: form.referenceKind || undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    coordOrigin: form.coordOrigin || undefined,
    coordPrecisionM: form.coordPrecisionM.trim() ? Number(form.coordPrecisionM) : undefined,
    locationType: form.locationType || undefined,
    locationValidatedAt: form.locationValidatedAt || undefined,
    numberConfirmed: form.numberConfirmed === '' ? undefined : form.numberConfirmed,
  }
}

export function AssetLocationFields({
  form,
  onChange,
  category,
}: {
  form: LocationForm
  onChange: (next: LocationForm) => void
  category: string
}) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const formRef = useRef(form)
  formRef.current = form
  const lookedUp = useRef(form.cep.replace(/\D/g, ''))

  const latN = form.lat ? Number(form.lat) : undefined
  const lngN = form.lng ? Number(form.lng) : undefined
  const hasPoint = Number.isFinite(latN) && Number.isFinite(lngN)

  function set<K extends keyof LocationForm>(key: K, value: LocationForm[K]) {
    onChange({ ...form, [key]: value })
  }

  async function lookupCep(raw = form.cep, force = false) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    if (!force && lookedUp.current === digits) return
    setBusy(true)
    setHint(null)
    try {
      const rows = await suggestAssetLocation({ cep: digits })
      const s = rows[0]
      const current = formRef.current
      if (current.cep.replace(/\D/g, '') !== digits) return
      if (!s) {
        setHint('CEP não encontrado.')
        return
      }
      onChange({
        ...current,
        cep: s.cep || `${digits.slice(0, 5)}-${digits.slice(5)}`,
        street: s.street ?? '',
        neighborhood: s.neighborhood ?? '',
        city: s.city || 'Marília',
        uf: (s.uf || 'SP').toUpperCase(),
      })
      lookedUp.current = digits
      setHint(
        s.street
          ? 'Endereço preenchido a partir do CEP.'
          : 'CEP localizado. Informe o logradouro, porque este CEP não traz a rua.',
      )
    } catch {
      setHint('Não foi possível consultar o CEP.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8 || lookedUp.current === digits) return
    const timer = window.setTimeout(() => {
      void lookupCep(digits)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [form.cep])

  async function suggestAddress() {
    const q = [form.street, form.number, form.neighborhood, 'Marília SP'].filter(Boolean).join(', ')
    setBusy(true)
    setHint(null)
    try {
      const rows = await suggestAssetLocation({ q })
      setSuggestions(rows)
      if (!rows.length) setHint('Nenhuma sugestão de geocodificação para este endereço.')
    } catch {
      setHint('Geocodificação indisponível no momento.')
    } finally {
      setBusy(false)
    }
  }

  function applySuggestion(s: GeoSuggestion, mode: 'coords' | 'address') {
    const hasPoint = s.lat != null && s.lng != null && Number.isFinite(s.lat) && Number.isFinite(s.lng)
    if (mode === 'coords') {
      if (!hasPoint) {
        setHint('A consulta não devolveu coordenada. Informe o ponto no mapa ou digite latitude e longitude.')
        return
      }
      onChange({
        ...form,
        lat: String(roundCoord(s.lat!)),
        lng: String(roundCoord(s.lng!)),
        coordOrigin: 'geocodificacao',
        coordPrecisionM: form.coordPrecisionM || '30',
        numberConfirmed: true,
      })
      setHint('Coordenada sugerida aplicada. Logradouro e referência do operador foram mantidos.')
    } else {
      onChange({
        ...form,
        street: s.street || form.street,
        neighborhood: s.neighborhood || form.neighborhood,
        city: s.city || form.city,
        uf: s.uf || form.uf,
        cep: s.cep || form.cep,
        lat: form.lat || (hasPoint ? String(roundCoord(s.lat!)) : form.lat),
        lng: form.lng || (hasPoint ? String(roundCoord(s.lng!)) : form.lng),
        coordOrigin: form.coordOrigin || (hasPoint ? 'geocodificacao' : form.coordOrigin),
      })
      setHint(
        hasPoint
          ? 'Sugestão aplicada nos campos vazios. A referência textual existente não foi apagada.'
          : 'Endereço preenchido. A coordenada ficou em branco porque o CEP não localizou o ponto.',
      )
    }
    setSuggestions([])
  }

  return (
    <fieldset className="space-y-2 rounded-fogo-md border border-fogo-border/80 p-3">
      <legend className="px-1 text-xs font-medium text-fogo-text">Localização em Marília</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-fogo-muted">CEP</span>
          <span className="mt-1 flex gap-1">
            <input
              className="h-9 w-full rounded-fogo-md border border-fogo-border px-2"
              value={form.cep}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              onChange={(e) => set('cep', e.target.value)}
              onBlur={() => void lookupCep()}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void lookupCep(form.cep, true)}>
              CEP
            </Button>
          </span>
        </label>
        <label className="block">
          <span className="text-fogo-muted">Bairro</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.neighborhood}
            onChange={(e) => set('neighborhood', e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block">
          <span className="text-fogo-muted">Cidade</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-fogo-muted">UF</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 uppercase"
            maxLength={2}
            value={form.uf}
            onChange={(e) => set('uf', e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-fogo-muted">Logradouro</span>
        <input
          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
          value={form.street}
          onChange={(e) => set('street', e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-fogo-muted">Tipo de referência</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.referenceKind}
            onChange={(e) => set('referenceKind', e.target.value as LocationReferenceKind)}
          >
            {(Object.keys(REFERENCE_KIND_LABELS) as LocationReferenceKind[]).map((k) => (
              <option key={k} value={k}>
                {REFERENCE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-fogo-muted">Número / km</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.number}
            onChange={(e) => set('number', e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-fogo-muted">Referência textual</span>
        <input
          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
          placeholder="oposto ao n.º, s/n, ponto conhecido…"
          value={form.reference}
          onChange={(e) => set('reference', e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-fogo-muted">Latitude</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-xs"
            value={form.lat}
            onChange={(e) => set('lat', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-fogo-muted">Longitude</span>
          <input
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2 font-mono text-xs"
            value={form.lng}
            onChange={(e) => set('lng', e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-fogo-muted">Origem da coordenada</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.coordOrigin}
            onChange={(e) => set('coordOrigin', e.target.value as CoordOrigin)}
          >
            <option value="">Não informada</option>
            {(Object.keys(COORD_ORIGIN_LABELS) as CoordOrigin[]).map((k) => (
              <option key={k} value={k}>
                {COORD_ORIGIN_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-fogo-muted">Precisão (m)</span>
          <input
            type="number"
            min={0}
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.coordPrecisionM}
            onChange={(e) => set('coordPrecisionM', e.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-fogo-muted">Tipo de localização</span>
          <select
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.locationType}
            onChange={(e) => set('locationType', e.target.value as LocationType)}
          >
            {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((k) => (
              <option key={k} value={k}>
                {LOCATION_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-fogo-muted">Última validação da localização</span>
          <input
            type="date"
            className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
            value={form.locationValidatedAt}
            onChange={(e) => set('locationValidatedAt', e.target.value)}
          />
        </label>
      </div>
      {form.locationType === 'recurso_movel' ? (
        <p className="text-[11px] text-fogo-muted">
          Para recurso móvel este ponto é a base ou local de referência. A posição corrente entra como evento de
          localização separado.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void suggestAddress()}>
          Sugerir endereço
        </Button>
      </div>
      {hint ? <p className="text-[11px] text-fogo-accent">{hint}</p> : null}
      {suggestions.length ? (
        <ul className="space-y-1 rounded-fogo-md border border-fogo-border bg-fogo-bg p-2 text-xs">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`} className="space-y-1 border-b border-fogo-border/60 pb-1 last:border-0">
              <p className="text-fogo-text">{s.label}</p>
              <div className="flex gap-1">
                {s.lat != null && s.lng != null ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => applySuggestion(s, 'coords')}>
                    Só coordenada
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => applySuggestion(s, 'address')}>
                  Preencher vazios
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-hidden rounded-fogo-md border border-fogo-border">
        <p className="bg-fogo-bg px-2 py-1 text-[11px] text-fogo-muted">
          Clique no mapa para marcar o ponto. A referência textual não é alterada pelo clique.
        </p>
        <MariliaCityMap
          heightClass="h-[220px]"
          pickMode
          points={
            hasPoint
              ? [
                  {
                    id: 'pick',
                    lat: latN as number,
                    lng: lngN as number,
                    kind: categoryToMarkerKind(category),
                    category,
                    name: form.street || 'Ponto cadastral',
                    role: 'cadastro',
                  },
                ]
              : []
          }
          onPick={(lat, lng) => {
            onChange({
              ...form,
              lat: String(roundCoord(lat)),
              lng: String(roundCoord(lng)),
              coordOrigin: 'mapa',
              numberConfirmed: true,
            })
            setHint('Ponto marcado no mapa. Endereço informado pelo operador permanece.')
          }}
        />
      </div>
    </fieldset>
  )
}
