import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Clock, Cpu, Shield, UserCog, Users } from 'lucide-react'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { cityPath, operationModeLabel, tenantStatusLabel } from '@/lib/tenant'
import { fetchPlatformOverview, type PlatformOverview } from '@/lib/tenantApi'
import { cn } from '@/lib/cn'

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint: string
  tone?: 'ok' | 'warn' | 'accent'
}) {
  return (
    <div className="bg-fogo-surface px-4 py-3">
      <p className="text-xs text-fogo-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-2xl font-semibold tabular-nums',
          tone === 'ok' && 'text-fogo-success',
          tone === 'warn' && 'text-fogo-warning',
          tone === 'accent' && 'text-fogo-accent',
          !tone && 'text-fogo-text',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-fogo-muted">{hint}</p>
    </div>
  )
}

function MacroRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-fogo-muted">{label}</span>
        <span className="font-mono tabular-nums text-fogo-text">
          {value}
          <span className="ml-1 text-[11px] text-fogo-muted">{pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fogo-border/70">
        <div className="h-full rounded-full bg-fogo-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPlatformOverview()
      .then((next) => {
        if (!cancelled) {
          setData(next)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar o painel')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cities = useMemo(
    () => [...(data?.cities ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [data],
  )

  if (!data && !error) return <LoadScreen full={false} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fogo-text">Painel da plataforma</h1>
        <p className="text-sm text-fogo-muted">Concentra ativos, usuários e o estado dos tenants municipais.</p>
      </div>

      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-border sm:grid-cols-4">
        <Kpi
          label="Ativos rodando"
          value={data?.assets.running ?? 0}
          hint={data ? `${data.assets.total} cadastrados · ${data.assets.alert} em alerta` : 'Operacionais em todas as cidades'}
          tone="ok"
        />
        <Kpi
          label="Usuários"
          value={data?.users.total ?? 0}
          hint="Contas ativas nos tenants"
          tone="accent"
        />
        <Kpi
          label="Cidades ativas"
          value={data?.tenants.active ?? 0}
          hint={data ? `${data.tenants.total} tenant(s) no total` : 'Ambientes em operação'}
        />
        <Kpi
          label="Operação real"
          value={data?.tenants.real ?? 0}
          hint={data ? `${data.tenants.demo} em demonstração` : 'Tenants fora do modo demo'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OpsPanel title="Tenants" subtitle="Estado e modo de operação">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-fogo-muted">Estado</p>
              <MacroRow label="Ativas" value={data?.tenants.active ?? 0} total={data?.tenants.total ?? 0} />
              <MacroRow label="Suspensas" value={data?.tenants.suspended ?? 0} total={data?.tenants.total ?? 0} />
              <MacroRow label="Arquivadas" value={data?.tenants.archived ?? 0} total={data?.tenants.total ?? 0} />
              <MacroRow
                label="Provisionando"
                value={data?.tenants.provisioning ?? 0}
                total={data?.tenants.total ?? 0}
              />
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-fogo-muted">Modo</p>
              <MacroRow label="Operação real" value={data?.tenants.real ?? 0} total={data?.tenants.total ?? 0} />
              <MacroRow label="Demonstração" value={data?.tenants.demo ?? 0} total={data?.tenants.total ?? 0} />
              <div className="pt-2 text-sm text-fogo-muted">
                <p className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5" aria-hidden />
                  {data?.assets.inactive ?? 0} ativo(s) inativos
                </p>
                <p className="mt-1 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {data?.users.total ?? 0} usuário(s) distintos
                </p>
              </div>
            </div>
          </div>
        </OpsPanel>

        <OpsPanel title="Atalhos" subtitle="Administração da plataforma">
          <div className="grid gap-2 p-3">
            <Link
              to="/mng/cidades"
              className="flex items-center gap-3 rounded-fogo-md border border-fogo-border px-3 py-2.5 text-sm text-fogo-text hover:bg-fogo-hover-elevated"
            >
              <Building2 className="h-4 w-4 text-fogo-accent" aria-hidden />
              Gerenciar cidades
            </Link>
            <Link
              to="/mng/administradores"
              className="flex items-center gap-3 rounded-fogo-md border border-fogo-border px-3 py-2.5 text-sm text-fogo-text hover:bg-fogo-hover-elevated"
            >
              <UserCog className="h-4 w-4 text-fogo-accent" aria-hidden />
              Superadministradores de cidade
            </Link>
            <Link
              to="/mng/infraestrutura"
              className="flex items-center gap-3 rounded-fogo-md border border-fogo-border px-3 py-2.5 text-sm text-fogo-text hover:bg-fogo-hover-elevated"
            >
              <Cpu className="h-4 w-4 text-fogo-accent" aria-hidden />
              Infraestrutura da VM
            </Link>
            <Link
              to="/mng/firewall"
              className="flex items-center gap-3 rounded-fogo-md border border-fogo-border px-3 py-2.5 text-sm text-fogo-text hover:bg-fogo-hover-elevated"
            >
              <Shield className="h-4 w-4 text-fogo-accent" aria-hidden />
              Firewall
            </Link>
            <Link
              to="/mng/sessoes"
              className="flex items-center gap-3 rounded-fogo-md border border-fogo-border px-3 py-2.5 text-sm text-fogo-text hover:bg-fogo-hover-elevated"
            >
              <Clock className="h-4 w-4 text-fogo-accent" aria-hidden />
              Tempo de sessão
            </Link>
          </div>
        </OpsPanel>
      </div>

      <OpsPanel
        title="Cidades"
        subtitle={!data ? 'Carregando…' : `${cities.length} tenant(s)`}
        action={
          <Link to="/mng/cidades" className="text-xs text-fogo-accent hover:underline">
            Abrir grade
          </Link>
        }
      >
        {!data ? (
          <p className="p-4 text-sm text-fogo-muted">Carregando totais…</p>
        ) : cities.length === 0 ? (
          <p className="p-4 text-sm text-fogo-muted">Nenhuma cidade provisionada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-fogo-border text-[11px] uppercase text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Modo</th>
                  <th className="px-3 py-2 font-medium">Usuários</th>
                  <th className="px-3 py-2 font-medium">Ativos rodando</th>
                  <th className="px-3 py-2 font-medium">Acesso</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((t) => (
                  <tr key={t.id} className="border-b border-fogo-border/70">
                    <td className="px-3 py-2">
                      <Link to={`/mng/cidades/${t.id}`} className="font-medium text-fogo-text hover:text-fogo-accent">
                        {t.name}
                      </Link>
                      <p className="font-mono text-[11px] text-fogo-muted">{t.slug}</p>
                    </td>
                    <td className="px-3 py-2 text-fogo-text">{tenantStatusLabel(t.status)}</td>
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
                    <td className="px-3 py-2 tabular-nums">{t.memberCount}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {t.runningAssetCount}
                      <span className="ml-1 text-[11px] text-fogo-muted">/ {t.assetCount}</span>
                    </td>
                    <td className="px-3 py-2">
                      {t.status === 'active' ? (
                        <a className="text-xs text-fogo-accent hover:underline" href={cityPath(t.slug, '/')}>
                          Abrir CCO
                        </a>
                      ) : (
                        <span className="text-xs text-fogo-muted">—</span>
                      )}
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
