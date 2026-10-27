import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { formatDateTimePtBr } from '@/lib/format'
import { cityPath } from '@/lib/tenant'
import { memberStatusLabel } from '@/lib/userDisplay'
import {
  createCitySuperAdmin,
  createPlatformAdmin,
  deletePlatformAdmin,
  fetchAdminTenants,
  fetchCitySuperAdmins,
  fetchPlatformAdmins,
  fetchPlatformMe,
  patchPlatformAdmin,
  type AdminTenant,
  type CitySuperAdmin,
  type PlatformSuperAdmin,
} from '@/lib/tenantApi'

const inputClass =
  'mt-1 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm text-fogo-text'

export function CityAdminsPage() {
  const [searchParams] = useSearchParams()
  const presetCity = searchParams.get('cidade') ?? ''

  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [admins, setAdmins] = useState<CitySuperAdmin[]>([])
  const [platformAdmins, setPlatformAdmins] = useState<PlatformSuperAdmin[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [platformSaving, setPlatformSaving] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [platformTempPassword, setPlatformTempPassword] = useState<string | null>(null)

  const [tenantId, setTenantId] = useState(presetCity)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [platformEmail, setPlatformEmail] = useState('')
  const [platformName, setPlatformName] = useState('')
  const [platformPassword, setPlatformPassword] = useState('')

  const cities = useMemo(
    () => tenants.filter((t) => t.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [tenants],
  )

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [tenantData, adminData, platformData, me] = await Promise.all([
        fetchAdminTenants(),
        fetchCitySuperAdmins(),
        fetchPlatformAdmins(),
        fetchPlatformMe(),
      ])
      setTenants(tenantData.tenants)
      setAdmins(adminData.admins)
      setPlatformAdmins(platformData.admins)
      setMeId(me.user.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar superadministradores')
    } finally {
      setLoading(false)
      setReady(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (presetCity) setTenantId(presetCity)
  }, [presetCity])

  async function onCreatePlatform(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setPlatformTempPassword(null)
    if (!platformEmail.trim()) {
      setError('Informe o e-mail do superadministrador da plataforma.')
      return
    }
    setPlatformSaving(true)
    try {
      const created = await createPlatformAdmin({
        email: platformEmail.trim(),
        displayName: platformName.trim() || undefined,
        password: platformPassword.trim() || undefined,
      })
      setNotice(
        created.linkedExisting
          ? `${created.email} já existia e agora é superadministrador da plataforma.`
          : 'Superadministrador da plataforma criado.',
      )
      if (created.temporaryPassword) setPlatformTempPassword(created.temporaryPassword)
      setPlatformEmail('')
      setPlatformName('')
      setPlatformPassword('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o superadministrador da plataforma.')
    } finally {
      setPlatformSaving(false)
    }
  }

  async function changePlatformStatus(admin: PlatformSuperAdmin, status: 'active' | 'inactive') {
    const label = status === 'inactive' ? 'inativar' : 'reativar'
    if (!window.confirm(`${label[0]!.toUpperCase()}${label.slice(1)} ${admin.email ?? admin.displayName}?`)) return
    setBusyUserId(admin.userId)
    setError(null)
    try {
      await patchPlatformAdmin(admin.userId, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o estado.')
    } finally {
      setBusyUserId(null)
    }
  }

  async function removePlatform(admin: PlatformSuperAdmin) {
    if (!window.confirm(`Excluir o superadministrador ${admin.email ?? admin.displayName} da plataforma?`)) return
    setBusyUserId(admin.userId)
    setError(null)
    try {
      await deletePlatformAdmin(admin.userId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setBusyUserId(null)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setTempPassword(null)
    if (!tenantId) {
      setError('Selecione a cidade.')
      return
    }
    if (!email.trim()) {
      setError('Informe o e-mail.')
      return
    }
    setSaving(true)
    try {
      const created = await createCitySuperAdmin({
        tenantId,
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        password: password.trim() || undefined,
      })
      const city = cities.find((c) => c.id === created.tenantId)
      setNotice(
        created.linkedExisting
          ? `${created.email} já existia e agora é superadministrador de ${created.tenantName}.`
          : `Superadministrador criado para ${city?.name ?? created.tenantName}.`,
      )
      if (created.temporaryPassword) setTempPassword(created.temporaryPassword)
      setEmail('')
      setDisplayName('')
      setPassword('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o superadministrador.')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) return <LoadScreen full={false} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fogo-text">Superadministradores</h1>
        <p className="text-sm text-fogo-muted">
          Plataforma no MNG, ou administrador de cidade no CCO municipal. O ADM original da plataforma não pode ser
          inativado nem excluído.
        </p>
      </div>

      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-fogo-md border border-fogo-success/30 bg-fogo-success/10 px-3 py-2 text-sm text-fogo-text">
          {notice}
        </p>
      ) : null}
      {platformTempPassword ? (
        <p className="rounded-fogo-md border border-fogo-accent/30 bg-fogo-accent/10 px-3 py-2 text-sm text-fogo-text">
          Senha provisória da plataforma:{' '}
          <code className="font-mono text-[13px]">{platformTempPassword}</code>
          <span className="mt-1 block text-[12px] text-fogo-muted">
            Copie agora. Ela some ao recarregar e será pedida a troca no primeiro acesso.
          </span>
        </p>
      ) : null}
      {tempPassword ? (
        <p className="rounded-fogo-md border border-fogo-accent/30 bg-fogo-accent/10 px-3 py-2 text-sm text-fogo-text">
          Senha provisória:{' '}
          <code className="font-mono text-[13px]">{tempPassword}</code>
          <span className="mt-1 block text-[12px] text-fogo-muted">
            Copie agora. Ela some ao recarregar e será pedida a troca no primeiro acesso.
          </span>
        </p>
      ) : null}

      <OpsPanel
        title="Superadministrador da plataforma"
        subtitle="Réplica do ADM atual do MNG. Pode tudo, menos inativar ou excluir o administrador original."
      >
        <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => void onCreatePlatform(e)}>
          <label className="text-sm text-fogo-text">
            Nome
            <input
              className={inputClass}
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="text-sm text-fogo-text">
            E-mail
            <input
              type="email"
              className={inputClass}
              value={platformEmail}
              onChange={(e) => setPlatformEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="text-sm text-fogo-text sm:col-span-2">
            Senha
            <input
              type="password"
              className={inputClass}
              value={platformPassword}
              onChange={(e) => setPlatformPassword(e.target.value)}
              autoComplete="new-password"
              minLength={platformPassword ? 12 : undefined}
              placeholder="Deixe vazio para gerar uma senha provisória"
            />
            <span className="mt-1 block text-[11px] text-fogo-muted">Mínimo de 12 caracteres, se informar uma senha.</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={platformSaving}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {platformSaving ? 'Criando…' : 'Criar superADM da plataforma'}
            </Button>
          </div>
        </form>
        <div className="overflow-x-auto border-t border-fogo-border/80">
          {loading ? (
            <p className="p-4 text-sm text-fogo-muted">Carregando contas da plataforma…</p>
          ) : platformAdmins.length === 0 ? (
            <p className="p-4 text-sm text-fogo-muted">Nenhum superadministrador da plataforma.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-fogo-border text-[11px] uppercase text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Papel</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {platformAdmins.map((admin) => {
                  const locked = admin.isOriginal || admin.userId === meId
                  return (
                    <tr key={admin.userId} className="border-b border-fogo-border/70">
                      <td className="px-3 py-2 font-medium text-fogo-text">{admin.displayName}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-fogo-text">{admin.email ?? '—'}</td>
                      <td className="px-3 py-2">
                        {admin.isOriginal ? (
                          <span className="rounded-full bg-fogo-accent/15 px-2 py-0.5 text-[11px] text-fogo-accent">
                            Original
                          </span>
                        ) : (
                          <span className="text-fogo-muted">Réplica</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{memberStatusLabel(admin.status)}</td>
                      <td className="px-3 py-2 tabular-nums text-fogo-muted">{formatDateTimePtBr(admin.createdAt)}</td>
                      <td className="px-3 py-2">
                        {locked ? (
                          <span className="text-xs text-fogo-muted">
                            {admin.isOriginal ? 'Protegido' : 'Conta atual'}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {admin.status === 'inactive' ? (
                              <button
                                type="button"
                                disabled={busyUserId === admin.userId}
                                className="text-xs text-fogo-accent hover:underline"
                                onClick={() => void changePlatformStatus(admin, 'active')}
                              >
                                Reativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyUserId === admin.userId}
                                className="text-xs text-fogo-warning hover:underline"
                                onClick={() => void changePlatformStatus(admin, 'inactive')}
                              >
                                Inativar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyUserId === admin.userId}
                              className="text-xs text-fogo-critical hover:underline"
                              onClick={() => void removePlatform(admin)}
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </OpsPanel>

      <OpsPanel title="Novo superadministrador de cidade" subtitle="Sem escolha de grupo — o vínculo é sempre Administrador de cidade.">
        <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
          <label className="text-sm text-fogo-text sm:col-span-2">
            Cidade
            <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
              <option value="">Selecione a cidade</option>
              {cities.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-fogo-text">
            Nome
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="text-sm text-fogo-text">
            E-mail
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="text-sm text-fogo-text sm:col-span-2">
            Senha
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={password ? 12 : undefined}
              placeholder="Deixe vazio para gerar uma senha provisória"
            />
            <span className="mt-1 block text-[11px] text-fogo-muted">Mínimo de 12 caracteres, se informar uma senha.</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={saving || cities.length === 0}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {saving ? 'Criando…' : 'Criar superadministrador'}
            </Button>
          </div>
        </form>
      </OpsPanel>

      <OpsPanel title="Contas de cidade" subtitle={loading ? 'Carregando…' : `${admins.length} superadministrador(es)`}>
        {loading ? (
          <p className="p-4 text-sm text-fogo-muted">Carregando contas…</p>
        ) : admins.length === 0 ? (
          <p className="p-4 text-sm text-fogo-muted">Nenhum superadministrador de cidade ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-fogo-border text-[11px] uppercase text-fogo-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-3 py-2 font-medium">Acesso</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id} className="border-b border-fogo-border/70">
                    <td className="px-3 py-2 font-medium text-fogo-text">{admin.displayName}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-fogo-text">{admin.email ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Link to={`/mng/cidades/${admin.tenantId}`} className="text-fogo-text hover:text-fogo-accent">
                        {admin.tenantName}
                      </Link>
                      <p className="font-mono text-[11px] text-fogo-muted">{admin.tenantSlug}</p>
                    </td>
                    <td className="px-3 py-2">{memberStatusLabel(admin.status)}</td>
                    <td className="px-3 py-2 tabular-nums text-fogo-muted">{formatDateTimePtBr(admin.createdAt)}</td>
                    <td className="px-3 py-2">
                      {admin.tenantSlug ? (
                        <a className="text-xs text-fogo-accent hover:underline" href={cityPath(admin.tenantSlug, '/login')}>
                          Login da cidade
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

      {cities.length === 0 && !loading ? (
        <p className="text-sm text-fogo-muted">
          Nenhuma cidade disponível.{' '}
          <Link to="/mng/cidades/nova" className="text-fogo-accent hover:underline">
            Provisionar cidade
          </Link>
        </p>
      ) : null}
    </div>
  )
}
