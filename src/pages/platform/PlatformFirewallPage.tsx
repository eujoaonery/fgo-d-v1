import { useEffect, useState } from 'react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { formatDateTimePtBr } from '@/lib/format'
import {
  fetchAdminTenants,
  fetchPlatformFirewall,
  savePlatformFirewall,
  type AdminTenant,
} from '@/lib/tenantApi'

function CidrList({
  values,
  onChange,
  placeholder,
  disabled,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const parts = draft
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const p of parts) {
      if (!next.includes(p)) next.push(p)
    }
    onChange(next)
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 font-mono text-sm"
        />
        <Button size="sm" disabled={disabled || !draft.trim()} onClick={add}>
          Incluir
        </Button>
      </div>
      {values.length === 0 ? (
        <p className="text-[12px] text-fogo-muted">Lista vazia — sem restrição neste campo.</p>
      ) : (
        <ul className="divide-y divide-fogo-border/70 rounded-fogo-md border border-fogo-border/80">
          {values.map((cidr) => (
            <li key={cidr} className="flex items-center justify-between gap-2 px-3 py-1.5 font-mono text-sm">
              <span>{cidr}</span>
              <button
                type="button"
                disabled={disabled}
                className="text-xs text-fogo-muted hover:text-fogo-critical"
                onClick={() => onChange(values.filter((x) => x !== cidr))}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PlatformFirewallPage() {
  const [siteAllow, setSiteAllow] = useState<string[]>([])
  const [siteDeny, setSiteDeny] = useState<string[]>([])
  const [mngAllow, setMngAllow] = useState<string[]>([])
  const [clientIp, setClientIp] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [includeMyIp, setIncludeMyIp] = useState(true)
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [fw, cities] = await Promise.all([fetchPlatformFirewall(), fetchAdminTenants()])
      setSiteAllow(fw.siteAllow)
      setSiteDeny(fw.siteDeny)
      setMngAllow(fw.mngAllow)
      setClientIp(fw.clientIp)
      setUpdatedAt(fw.updatedAt)
      setTenants(cities.tenants)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o firewall')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function apply() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const next = await savePlatformFirewall({ siteAllow, siteDeny, mngAllow, includeMyIp })
      setSiteAllow(next.siteAllow)
      setSiteDeny(next.siteDeny)
      setMngAllow(next.mngAllow)
      setClientIp(next.clientIp)
      setUpdatedAt(next.updatedAt)
      setNotice(next.detail ?? 'Salvo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !error) return <LoadScreen full={false} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-fogo-text">Firewall</h1>
        <Badge variant="default">Seu IP {clientIp ?? '—'}</Badge>
      </div>

      {error ? <p className="text-sm text-fogo-warning">{error}</p> : null}
      {notice ? <p className="text-sm text-fogo-success">{notice}</p> : null}

      <label className="flex items-center gap-2 text-sm text-fogo-text">
        <input type="checkbox" checked={includeMyIp} onChange={(e) => setIncludeMyIp(e.target.checked)} />
        Incluir meu IP automaticamente nas listas de permissão, para eu não me trancar fora
      </label>

      <OpsPanel
        title="Abertura do sistema"
        subtitle="Vale para o site inteiro, inclusive API. Faixa no formato 203.0.113.0/24 ou um IP só."
      >
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-fogo-text">Permitir só estes IPs</p>
            <p className="mb-2 text-[12px] text-fogo-muted">Vazio: qualquer um, salvo os bloqueados abaixo.</p>
            <CidrList
              values={siteAllow}
              onChange={setSiteAllow}
              disabled={loading}
              placeholder="Ex.: 186.251.0.0/24"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-fogo-text">Bloquear estes IPs</p>
            <p className="mb-2 text-[12px] text-fogo-muted">Estes nem chegam a abrir a página. 403 direto no navegador.</p>
            <CidrList
              values={siteDeny}
              onChange={setSiteDeny}
              disabled={loading}
              placeholder="Ex.: 198.51.100.10"
            />
          </div>
        </div>
      </OpsPanel>

      <OpsPanel
        title="Rota /mng"
        subtitle="Painel da plataforma. Quem estiver fora desta lista não carrega o FOGO — o navegador mostra o erro do servidor."
      >
        <div className="p-4">
          <p className="mb-2 text-sm font-medium text-fogo-text">IPs com acesso a /mng</p>
          <p className="mb-2 text-[12px] text-fogo-muted">
            Vazio: segue só a regra da abertura do sistema. Preenchido: somente estas faixas.
          </p>
          <CidrList
            values={mngAllow}
            onChange={setMngAllow}
            disabled={loading}
            placeholder="Ex.: 186.251.0.17"
          />
        </div>
      </OpsPanel>

      <OpsPanel
        title="Login por cidade"
        subtitle="Recorte futuro: cada município com a própria lista. Só o desenho, ainda não recusa tráfego."
        action={<Badge variant="neutral">Em breve</Badge>}
      >
        <div className="pointer-events-none select-none p-4 opacity-55" aria-disabled>
          <div className="overflow-x-auto rounded-fogo-md border border-fogo-border/80">
            <table className="w-full text-left text-sm">
              <thead className="bg-fogo-bg/70 text-xs text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 font-medium">Identificador</th>
                  <th className="px-3 py-2 font-medium">Faixas permitidas no login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fogo-border/60">
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-fogo-muted">
                      Nenhuma cidade cadastrada.
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">{t.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                      <td className="px-3 py-2">
                        <input
                          disabled
                          placeholder="Feature futura"
                          className="h-8 w-full max-w-sm rounded-fogo-md border border-fogo-border bg-fogo-bg px-2 text-xs"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </OpsPanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-fogo-muted">
          {updatedAt ? `Última gravação ${formatDateTimePtBr(updatedAt)}` : 'Ainda não há regra aplicada.'}
        </p>
        <Button variant="primary" disabled={loading || saving} onClick={() => void apply()}>
          {saving ? 'Aplicando…' : 'Aplicar no firewall'}
        </Button>
      </div>
    </div>
  )
}
