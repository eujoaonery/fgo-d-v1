import { useEffect, useState } from 'react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { fetchAlphaConfig, saveAlphaConfig } from '@/lib/api'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'

const inputClass =
  'mt-1 w-full rounded-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text'

export function SettingsAlphaPanel({ apiConnected }: { apiConnected: boolean }) {
  const { can } = useCcoAccess()
  const href = useCityHref()
  const manage = can('settings', 'manage')
  const [cityName, setCityName] = useState('')
  const [uf, setUf] = useState('SP')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [holidays, setHolidays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    if (!apiConnected) return
    void fetchAlphaConfig()
      .then(({ city }) => {
        setCityName(city.cityName)
        setUf(city.uf)
        setLat(String(city.lat))
        setLng(String(city.lng))
        setTimezone(city.timezone)
        setHolidays(city.municipalHolidays.join(', '))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar a cidade de referência.'))
  }, [apiConnected])

  async function onSave() {
    if (!manage) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const municipalHolidays = holidays
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{2}-\d{2}$/.test(s))
      await saveAlphaConfig({
        cityName,
        uf,
        lat: Number(lat),
        lng: Number(lng),
        timezone,
        municipalHolidays,
      })
      setOk('Ponto meteorológico atualizado. As próximas análises usam estas coordenadas.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  if (!can('prometheusAlpha', 'view') && !can('settings', 'view')) return null

  return (
    <OpsPanel
      title="Prometheus Alpha · cidade de referência"
      subtitle="O ponto meteorológico é municipal. Não assume que todos os ativos estejam neste envelope."
      action={
        <Link to={href(ROUTES.prometheusAlpha)} className="text-xs text-fogo-accent hover:underline">
          Abrir Alpha
        </Link>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {error ? <p className="sm:col-span-2 text-sm text-fogo-critical">{error}</p> : null}
        {ok ? <p className="sm:col-span-2 text-sm text-fogo-success">{ok}</p> : null}
        <label className="text-xs text-fogo-muted">
          Cidade
          <input className={inputClass} value={cityName} onChange={(e) => setCityName(e.target.value)} disabled={!manage} />
        </label>
        <label className="text-xs text-fogo-muted">
          UF
          <input className={inputClass} value={uf} onChange={(e) => setUf(e.target.value)} disabled={!manage} maxLength={2} />
        </label>
        <label className="text-xs text-fogo-muted">
          Latitude
          <input className={inputClass} value={lat} onChange={(e) => setLat(e.target.value)} disabled={!manage} />
        </label>
        <label className="text-xs text-fogo-muted">
          Longitude
          <input className={inputClass} value={lng} onChange={(e) => setLng(e.target.value)} disabled={!manage} />
        </label>
        <label className="text-xs text-fogo-muted sm:col-span-2">
          Fuso (IANA)
          <input className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!manage} />
        </label>
        <label className="text-xs text-fogo-muted sm:col-span-2">
          Feriados municipais (MM-DD, separados por vírgula)
          <input className={inputClass} value={holidays} onChange={(e) => setHolidays(e.target.value)} disabled={!manage} placeholder="04-04, 12-08" />
        </label>
        {manage ? (
          <div className="sm:col-span-2">
            <Button type="button" variant="primary" disabled={busy || !apiConnected} onClick={() => void onSave()}>
              {busy ? 'Salvando…' : 'Salvar ponto de referência'}
            </Button>
          </div>
        ) : (
          <p className="sm:col-span-2 text-xs text-fogo-muted">Somente administradores alteram o ponto meteorológico.</p>
        )}
      </div>
    </OpsPanel>
  )
}
