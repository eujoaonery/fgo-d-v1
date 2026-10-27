import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { parseMapMunicipality } from '@/lib/mapMunicipality'
import { operationModeLabel, tenantStatusLabel, validateTenantSlug, type OperationMode } from '@/lib/tenant'
import {
  cancelTenantJob,
  createAdminTenant,
  fetchAdminTenant,
  fetchTenantEvents,
  fetchTenantJobs,
  patchAdminTenant,
  retryTenantJob,
  searchMunicipalities,
  type AdminTenant,
} from '@/lib/tenantApi'

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Manaus',
  'America/Cuiaba',
  'America/Belem',
  'America/Rio_Branco',
]

export function CityFormPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const isNew = !tenantId
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tenant, setTenant] = useState<AdminTenant | null>(null)
  const [events, setEvents] = useState<{ id: string; action: string; created_at: string }[]>([])
  const [jobs, setJobs] = useState<{ id: string; status: string; kind: string; error: string | null; created_at: string }[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [operationMode, setOperationMode] = useState<OperationMode>('demo')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [mapQuery, setMapQuery] = useState('')
  const [mapOptions, setMapOptions] = useState<{ id: number; name: string; uf: string }[]>([])
  const [mapCity, setMapCity] = useState<{ id: number; name: string; uf: string } | null>(null)
  const [mapSearching, setMapSearching] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setLoading(true)
    Promise.all([fetchAdminTenant(tenantId), fetchTenantEvents(tenantId), fetchTenantJobs(tenantId)])
      .then(([t, ev, jb]) => {
        if (cancelled) return
        setTenant(t)
        setName(t.name)
        setSlug(t.slug)
        setDescription(t.description ?? '')
        setOperationMode(t.operationMode)
        setTimezone(t.timezone)
        setEvents(ev.events)
        setJobs(jb.jobs)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  useEffect(() => {
    if (!isNew || mapCity) {
      setMapOptions([])
      return
    }
    const q = mapQuery.trim()
    if (q.length < 2) {
      setMapOptions([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setMapSearching(true)
      searchMunicipalities(q)
        .then((res) => {
          if (!cancelled) setMapOptions(res.municipalities)
        })
        .catch(() => {
          if (!cancelled) setMapOptions([])
        })
        .finally(() => {
          if (!cancelled) setMapSearching(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [isNew, mapCity, mapQuery])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const parsed = validateTenantSlug(slug)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (name.trim().length < 2) {
      setError('Informe o nome oficial da cidade.')
      return
    }
    if (isNew && !mapCity) {
      setError('Selecione o município que o mapa geral vai considerar.')
      return
    }
    setSaving(true)
    try {
      if (isNew && mapCity) {
        const created = await createAdminTenant({
          name: name.trim(),
          slug: parsed.slug,
          description: description.trim() || undefined,
          operationMode,
          timezone,
          mapIbgeId: mapCity.id,
        })
        setSuccess('Cidade provisionada. Nenhum dado operacional sintético foi gerado automaticamente.')
        navigate(`/mng/cidades/${created.tenant.id}`, { replace: true })
        return
      }
      if (!tenantId) return
      await patchAdminTenant(tenantId, {
        name: name.trim(),
        slug: parsed.slug,
        description: description.trim(),
        operationMode,
        timezone,
      })
      setSuccess('Alterações salvas.')
      const t = await fetchAdminTenant(tenantId)
      setTenant(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-fogo-muted">Carregando cidade…</p>
  const savedMap = tenant ? parseMapMunicipality(tenant.settings) : null

  return (
    <div className="space-y-4">
      <div>
        <Link to="/mng/cidades" className="text-xs text-fogo-accent hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-fogo-text">{isNew ? 'Nova cidade' : tenant?.name}</h1>
        {tenant ? (
          <p className="text-sm text-fogo-muted">
            {tenantStatusLabel(tenant.status)} · {operationModeLabel(tenant.operationMode)}
          </p>
        ) : (
          <p className="text-sm text-fogo-muted">Provisiona um tenant vazio, sem copiar dados operacionais.</p>
        )}
      </div>

      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-fogo-md border border-fogo-success/30 bg-fogo-success/10 px-3 py-2 text-sm">{success}</p>
      ) : null}

      <OpsPanel title="Identidade" subtitle="O identificador (slug) define a URL. O acesso continua autorizado no servidor.">
        <form className="space-y-4 p-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            Nome oficial
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3"
              required
            />
          </label>
          <label className="block text-sm">
            Identificador (slug)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 font-mono"
              required
            />
            <span className="mt-1 block text-[11px] text-fogo-muted">URL: /{slug || '…'}/login</span>
          </label>
          <label className="block text-sm">
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-[80px] w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Modo de operação
            <select
              value={operationMode}
              onChange={(e) => setOperationMode(e.target.value as OperationMode)}
              className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3"
            >
              <option value="demo">Demonstração</option>
              <option value="real">Operação real</option>
            </select>
            <span className="mt-1 block text-[11px] text-fogo-muted">
              {operationMode === 'real'
                ? 'Não inicia simulação nem apresenta dados sintéticos como reais. Cidades novas ficam aguardando configuração de dados.'
                : 'Pode utilizar dados sintéticos claramente identificados, somente nesta cidade.'}
            </span>
          </label>
          <label className="block text-sm">
            Fuso horário
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          {isNew ? (
            <div className="block text-sm">
              <span>Município do mapa geral</span>
              {mapCity ? (
                <p className="mt-1 flex items-center justify-between gap-2 rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 py-2">
                  <span>
                    {mapCity.name} — {mapCity.uf}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-fogo-accent hover:underline"
                    onClick={() => {
                      setMapCity(null)
                      setMapQuery('')
                    }}
                  >
                    Trocar
                  </button>
                </p>
              ) : (
                <>
                  <input
                    value={mapQuery}
                    onChange={(e) => setMapQuery(e.target.value)}
                    placeholder="Busque pelo nome do município"
                    className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3"
                    autoComplete="off"
                  />
                  <span className="mt-1 block text-[11px] text-fogo-muted">
                    O mapa geral desta cidade abre neste município. Cidades já criadas permanecem como estão.
                  </span>
                  {mapSearching ? <p className="mt-2 text-xs text-fogo-muted">Buscando municípios…</p> : null}
                  {mapOptions.length > 0 ? (
                    <ul className="mt-2 max-h-48 overflow-auto rounded-fogo-md border border-fogo-border">
                      {mapOptions.map((option) => (
                        <li key={option.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fogo-surface"
                            onClick={() => {
                              setMapCity(option)
                              setMapOptions([])
                            }}
                          >
                            <span>{option.name}</span>
                            <span className="text-xs text-fogo-muted">{option.uf}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {!isNew && savedMap ? (
            <p className="text-sm text-fogo-muted">
              Mapa geral: {savedMap.name} — {savedMap.uf}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Salvando…' : isNew ? 'Provisionar cidade' : 'Salvar alterações'}
          </Button>
        </form>
      </OpsPanel>

      {tenantId ? (
        <>
          <OpsPanel title="Superadministrador de cidade" subtitle="Acesso total ao CCO desta cidade. O grupo é sempre Administrador de cidade.">
            <div className="p-4">
              <Link
                to={`/mng/administradores?cidade=${tenantId}`}
                className="text-sm text-fogo-accent hover:underline"
              >
                Criar superadministrador para esta cidade
              </Link>
            </div>
          </OpsPanel>
          <OpsPanel title="Provisionamento">
            <ul className="space-y-2 p-4 text-sm">
              {jobs.length === 0 ? <li className="text-fogo-muted">Nenhuma tarefa registrada.</li> : null}
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {job.kind} · {job.status}
                    {job.error ? ` — ${job.error}` : ''}
                  </span>
                  <span className="flex gap-2">
                    {job.status === 'failed' ? (
                      <button
                        type="button"
                        className="text-xs text-fogo-accent hover:underline"
                        onClick={() => void retryTenantJob(tenantId, job.id).then(() => window.location.reload())}
                      >
                        Tentar de novo
                      </button>
                    ) : null}
                    {job.status === 'failed' || job.status === 'provisioning' || job.status === 'requested' ? (
                      <button
                        type="button"
                        className="text-xs text-fogo-muted hover:underline"
                        onClick={() => void cancelTenantJob(tenantId, job.id).then(() => window.location.reload())}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </OpsPanel>
          <OpsPanel title="Histórico administrativo">
            <ul className="space-y-2 p-4 text-sm">
              {events.length === 0 ? <li className="text-fogo-muted">Sem eventos ainda.</li> : null}
              {events.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-3">
                  <span>{ev.action}</span>
                  <span className="tabular-nums text-fogo-muted">{new Date(ev.created_at).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          </OpsPanel>
        </>
      ) : null}
    </div>
  )
}
