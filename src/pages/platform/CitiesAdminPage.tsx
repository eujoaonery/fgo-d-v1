import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { cityPath, operationModeLabel, tenantStatusLabel, type TenantStatus } from '@/lib/tenant'
import {
  changeAdminTenantStatus,
  fetchAdminTenants,
  type AdminTenant,
} from '@/lib/tenantApi'
import { cn } from '@/lib/cn'

export function CitiesAdminPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load(q = search) {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminTenants({ search: q || undefined })
      setTenants(data.tenants)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao listar cidades')
    } finally {
      setLoading(false)
      setReady(true)
    }
  }

  useEffect(() => {
    void load('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => tenants, [tenants])

  async function changeStatus(tenant: AdminTenant, status: TenantStatus, label: string) {
    if (!window.confirm(`${label} a cidade “${tenant.name}”? Os dados são preservados.`)) return
    setBusyId(tenant.id)
    setNotice(null)
    try {
      await changeAdminTenantStatus(tenant.id, status)
      setNotice(`Cidade ${tenant.name}: ${tenantStatusLabel(status).toLowerCase()}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o estado.')
    } finally {
      setBusyId(null)
    }
  }

  if (!ready) return <LoadScreen full={false} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fogo-text">Cidades</h1>
          <p className="text-sm text-fogo-muted">Cada cidade é um ambiente independente, com usuários e dados próprios.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/mng/cidades/nova')}>
          Nova cidade
        </Button>
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(search)
          }}
          placeholder="Pesquisar por nome ou identificador"
          className="h-10 flex-1 rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
        />
        <Button onClick={() => void load(search)}>Pesquisar</Button>
      </div>

      {notice ? (
        <p className="rounded-fogo-md border border-fogo-success/30 bg-fogo-success/10 px-3 py-2 text-sm text-fogo-text">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}

      <OpsPanel title="Ambientes provisionados" subtitle={loading ? 'Carregando…' : `${filtered.length} cidade(s)`}>
        {loading ? (
          <p className="p-4 text-sm text-fogo-muted">Carregando cidades…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-fogo-muted">Nenhuma cidade encontrada. Crie a primeira instalação municipal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-fogo-border text-[11px] uppercase text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 font-medium">Modo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Usuários</th>
                  <th className="px-3 py-2 font-medium">Ativos</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-fogo-border/70">
                    <td className="px-3 py-2">
                      <p className="font-medium text-fogo-text">{t.name}</p>
                      <p className="font-mono text-[11px] text-fogo-muted">{t.slug}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px]',
                          t.operationMode === 'demo'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {operationModeLabel(t.operationMode)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-fogo-text">{tenantStatusLabel(t.status)}</td>
                    <td className="px-3 py-2 tabular-nums">{t.memberCount ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{t.assetCount ?? 0}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Link className="text-xs text-fogo-accent hover:underline" to={`/mng/cidades/${t.id}`}>
                          Editar
                        </Link>
                        <Link
                          className="text-xs text-fogo-accent hover:underline"
                          to={`/mng/administradores?cidade=${t.id}`}
                        >
                          SuperADM
                        </Link>
                        <Link className="text-xs text-fogo-accent hover:underline" to={`/mng/cidades/${t.id}/duplicar`}>
                          Duplicar
                        </Link>
                        {t.status === 'active' ? (
                          <a className="text-xs text-fogo-accent hover:underline" href={cityPath(t.slug, '/')}>
                            Acessar
                          </a>
                        ) : null}
                        {t.status === 'active' ? (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            className="text-xs text-fogo-warning hover:underline"
                            onClick={() => void changeStatus(t, 'suspended', 'Suspender')}
                          >
                            Suspender
                          </button>
                        ) : null}
                        {t.status === 'suspended' ? (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            className="text-xs text-fogo-accent hover:underline"
                            onClick={() => void changeStatus(t, 'active', 'Reativar')}
                          >
                            Reativar
                          </button>
                        ) : null}
                        {t.status !== 'archived' ? (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            className="text-xs text-fogo-muted hover:underline"
                            onClick={() => void changeStatus(t, 'archived', 'Arquivar')}
                          >
                            Arquivar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsPanel>
    </div>
  )
}
