import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { DEFAULT_DUPLICATE_COPY, validateTenantSlug, type DuplicateCopyOptions, type OperationMode } from '@/lib/tenant'
import { duplicateAdminTenant, fetchAdminTenant, fetchTenantMembers, type AdminTenant } from '@/lib/tenantApi'

export function CityDuplicatePage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [source, setSource] = useState<AdminTenant | null>(null)
  const [members, setMembers] = useState<{ userId: string; displayName: string; email: string | null; role: string }[]>([])
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [operationMode, setOperationMode] = useState<OperationMode>('demo')
  const [copy, setCopy] = useState<DuplicateCopyOptions>({ ...DEFAULT_DUPLICATE_COPY })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    Promise.all([fetchAdminTenant(tenantId), fetchTenantMembers(tenantId)])
      .then(([t, m]) => {
        setSource(t)
        setName(`${t.name} (cópia)`)
        setSlug(`${t.slug}-copia`)
        setMembers(m.members)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar origem'))
      .finally(() => setLoading(false))
  }, [tenantId])

  function toggle<K extends keyof DuplicateCopyOptions>(key: K, value: DuplicateCopyOptions[K]) {
    setCopy((prev) => ({ ...prev, [key]: value }))
  }

  function goReview(e: React.FormEvent) {
    e.preventDefault()
    const parsed = validateTenantSlug(slug)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (name.trim().length < 2) {
      setError('Informe o nome da nova cidade.')
      return
    }
    setError(null)
    setStep('review')
  }

  async function execute() {
    if (!tenantId) return
    const parsed = validateTenantSlug(slug)
    if (!parsed.ok) return
    setSaving(true)
    setError(null)
    try {
      const result = await duplicateAdminTenant(tenantId, {
        name: name.trim(),
        slug: parsed.slug,
        operationMode,
        copy: { ...copy, history: false, userIds: copy.users ? copy.userIds : [] },
      })
      navigate(`/mng/cidades/${result.tenant.id}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na duplicação')
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-fogo-muted">Carregando cidade de origem…</p>
  if (!source) return <p className="text-sm text-fogo-critical">{error ?? 'Cidade não encontrada.'}</p>

  const categories: { key: keyof DuplicateCopyOptions; label: string; hint: string; disabled?: boolean }[] = [
    { key: 'ui', label: 'Estrutura e preferências de interface', hint: 'Fuso, locale e mapa cadastral' },
    { key: 'categories', label: 'Categorias e tipos de ativos', hint: 'Taxonomia, sem copiar o inventário' },
    { key: 'operationalSettings', label: 'Configurações operacionais', hint: 'Intervalos e intensidade; simulação inicia desligada' },
    { key: 'businessRules', label: 'Regras e parâmetros de negócio', hint: 'Configurações sanitizadas, sem segredos' },
    { key: 'moduleSettings', label: 'Configurações de módulos', hint: 'Grupos e permissões-modelo' },
    { key: 'users', label: 'Usuários e vínculos', hint: 'Copia somente os selecionados; senhas e superadmin global não vão' },
    { key: 'assets', label: 'Ativos cadastrais', hint: 'Não copiado nesta etapa — apenas categorias', disabled: true },
    { key: 'history', label: 'Histórico operacional', hint: 'Ocorrências, alertas e filas — não copiado', disabled: true },
  ]

  return (
    <div className="space-y-4">
      <Link to="/mng/cidades" className="text-xs text-fogo-accent hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-lg font-semibold text-fogo-text">Duplicar {source.name}</h1>
      <p className="text-sm text-fogo-muted">
        Cria um tenant novo. Ocorrências, alertas, sessões, senhas e chaves não são copiados.
      </p>
      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}

      {step === 'form' ? (
        <form className="space-y-4" onSubmit={goReview}>
          <OpsPanel title="Nova cidade">
            <div className="space-y-3 p-4">
              <label className="block text-sm">
                Nome oficial
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border px-3"
                  required
                />
              </label>
              <label className="block text-sm">
                Identificador
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border px-3 font-mono"
                  required
                />
              </label>
              <label className="block text-sm">
                Modo
                <select
                  value={operationMode}
                  onChange={(e) => setOperationMode(e.target.value as OperationMode)}
                  className="mt-1 h-10 w-full rounded-fogo-md border border-fogo-border px-3"
                >
                  <option value="demo">Demonstração</option>
                  <option value="real">Operação real</option>
                </select>
              </label>
            </div>
          </OpsPanel>
          <OpsPanel title="O que copiar">
            <ul className="space-y-2 p-4 text-sm">
              {categories.map((c) => (
                <li key={c.key}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={c.disabled ? false : Boolean(copy[c.key])}
                      disabled={c.disabled}
                      onChange={(e) => {
                        if (c.key === 'userIds' || c.key === 'history') return
                        toggle(c.key, e.target.checked as never)
                      }}
                    />
                    <span>
                      <span className="font-medium text-fogo-text">{c.label}</span>
                      <span className="block text-[11px] text-fogo-muted">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {copy.users ? (
              <div className="border-t border-fogo-border p-4">
                <p className="mb-2 text-xs text-fogo-muted">Selecione os usuários municipais. Privilégios globais não são copiados.</p>
                <ul className="space-y-1 text-sm">
                  {members.map((m) => (
                    <li key={m.userId}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={copy.userIds.includes(m.userId)}
                          onChange={(e) => {
                            setCopy((prev) => ({
                              ...prev,
                              userIds: e.target.checked
                                ? [...prev.userIds, m.userId]
                                : prev.userIds.filter((id) => id !== m.userId),
                            }))
                          }}
                        />
                        {m.displayName} <span className="text-fogo-muted">({m.role})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </OpsPanel>
          <Button type="submit" variant="primary">
            Revisar duplicação
          </Button>
        </form>
      ) : (
        <OpsPanel title="Revisão">
          <div className="space-y-2 p-4 text-sm">
            <p>
              <strong>{name}</strong> · /{slug}/login · {operationMode === 'real' ? 'real' : 'demonstração'}
            </p>
            <p className="text-fogo-muted">Origem: {source.name} ({source.slug})</p>
            <ul className="list-disc pl-5">
              {categories
                .filter((c) => c.key !== 'userIds' && copy[c.key] && c.key !== 'history')
                .map((c) => (
                  <li key={c.key}>{c.label}</li>
                ))}
            </ul>
            <p className="text-[11px] text-fogo-muted">
              Não serão copiados: ocorrências, alertas, histórico, sessões, senhas, chaves, filas nem superadministração.
            </p>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setStep('form')}>Voltar</Button>
              <Button variant="primary" disabled={saving} onClick={() => void execute()}>
                {saving ? 'Duplicando…' : 'Confirmar e provisionar'}
              </Button>
            </div>
          </div>
        </OpsPanel>
      )}
    </div>
  )
}
