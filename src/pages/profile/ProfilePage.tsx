import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { OpsHeader } from '@/components/layout/OpsHeader'
import { OpsTabBar } from '@/components/layout/OpsTabBar'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { UserAvatar } from '@/components/profile/UserAvatar'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { useTheme } from '@/context/ThemeContext'
import { fetchUserProfile, patchUserProfile, type UserProfileRecord } from '@/lib/api'
import { changePassword, removeUserAvatar, uploadUserAvatar } from '@/lib/profileClient'
import { memberRoleLabel } from '@/lib/userDisplay'
import { cn } from '@/lib/cn'
import { TurnstileField } from '@/components/auth/TurnstileField'

type Tab = 'conta' | 'aparencia' | 'seguranca'

function parseTab(raw: string | null): Tab {
  if (raw === 'aparencia') return 'aparencia'
  if (raw === 'seguranca') return 'seguranca'
  return 'conta'
}

export function ProfilePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OpsHeader dense trailing={null} />
      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        <div className="mx-auto max-w-3xl">
          <ProfileContent />
        </div>
      </main>
    </div>
  )
}

export function ProfileContent({ queryKey = 'aba' }: { queryKey?: string }) {
  const { profile: me, refreshProfile, signOut, authConfig } = useCcoAuth()
  const turnstileSiteKey = authConfig?.turnstileSiteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const onTurnstile = useCallback((t: string | null) => setTurnstileToken(t), [])
  const { theme, setTheme } = useTheme()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get(queryKey))

  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await fetchUserProfile()
      setUserProfile(p)
      setDisplayName(p.displayName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o perfil')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function setTab(next: Tab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'conta') nextParams.delete(queryKey)
    else nextParams.set(queryKey, next)
    setParams(nextParams, { replace: true })
  }

  async function saveDisplayName() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const updated = await patchUserProfile({ displayName: displayName.trim() })
      setUserProfile(updated)
      await refreshProfile()
      setMessage('Perfil atualizado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !userProfile) return
    setAvatarBusy(true)
    setError(null)
    setMessage(null)
    try {
      const url = await uploadUserAvatar(userProfile.userId, file)
      setUserProfile((p) => (p ? { ...p, avatarUrl: url } : p))
      await refreshProfile()
      setMessage('Foto atualizada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no upload')
    } finally {
      setAvatarBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onRemoveAvatar() {
    if (!userProfile?.avatarUrl) return
    setAvatarBusy(true)
    setError(null)
    try {
      const updated = await removeUserAvatar(userProfile.userId)
      setUserProfile(updated)
      await refreshProfile()
      setMessage('Foto removida.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover foto')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Confirmação da nova senha não confere.')
      return
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança.')
      return
    }
    setPasswordBusy(true)
    setError(null)
    setMessage(null)
    try {
      await changePassword(currentPassword, newPassword, turnstileToken ?? undefined)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Senha alterada com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha')
    } finally {
      setPasswordBusy(false)
    }
  }

  const actor = userProfile ?? {
    userId: me?.actor?.userId ?? '',
    email: me?.actor?.email ?? null,
    displayName: displayName || me?.actor?.email?.split('@')[0] || 'Operador',
    avatarUrl: null as string | null,
    role: me?.actor?.role ?? 'operator',
  }

  return (
    <>
          <OpsTabBar className="mb-4" aria-label="Abas do perfil">
            {(
              [
                ['conta', 'Minha conta'],
                ['aparencia', 'Aparência'],
                ['seguranca', 'Segurança'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? 'primary' : 'outline'}
                className={cn('shrink-0 whitespace-nowrap', tab !== id && 'bg-fogo-surface')}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </OpsTabBar>

          {error ? (
            <p className="mb-3 rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mb-3 rounded-fogo-md border border-fogo-success/35 bg-fogo-success-bg px-3 py-2 text-sm text-fogo-success">
              {message}
            </p>
          ) : null}

          {tab === 'conta' ? (
            <OpsPanel title="Minha conta" subtitle="Foto, nome e dados da sua participação no CCO">
              {loading ? (
                <p className="flex items-center gap-2 p-6 text-sm text-fogo-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando…
                </p>
              ) : (
                <div className="flex flex-col gap-6 p-4 sm:flex-row sm:items-start">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <UserAvatar
                        size="lg"
                        displayName={actor.displayName}
                        email={actor.email}
                        avatarUrl={actor.avatarUrl}
                      />
                      {avatarBusy ? (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-fogo-overlay/40">
                          <Loader2 className="h-6 w-6 animate-spin text-fogo-text" />
                        </span>
                      ) : null}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      onChange={(e) => void onPickAvatar(e.target.files?.[0])}
                    />
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={avatarBusy}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Camera className="mr-1.5 h-3.5 w-3.5" />
                        Enviar foto
                      </Button>
                      {actor.avatarUrl ? (
                        <Button size="sm" variant="ghost" disabled={avatarBusy} onClick={() => void onRemoveAvatar()}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Remover
                        </Button>
                      ) : null}
                    </div>
                    <p className="max-w-[200px] text-center text-[11px] text-fogo-muted">JPEG, PNG, WebP ou GIF · até 2 MB</p>
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-fogo-text">Nome de exibição</span>
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="mt-1.5 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
                        maxLength={120}
                      />
                    </label>
                    <Button variant="primary" size="sm" disabled={saving || !displayName.trim()} onClick={() => void saveDisplayName()}>
                      {saving ? 'Salvando…' : 'Salvar nome'}
                    </Button>

                    <dl className="grid gap-2 rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/40 p-3 text-sm">
                      <div>
                        <dt className="text-xs text-fogo-muted">E-mail</dt>
                        <dd className="font-medium text-fogo-text">{actor.email ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fogo-muted">Papel na organização</dt>
                        <dd className="font-medium text-fogo-text">{memberRoleLabel(actor.role)}</dd>
                      </div>
                      {me?.actor?.scopeRegion ? (
                        <div>
                          <dt className="text-xs text-fogo-muted">Região autorizada</dt>
                          <dd className="font-medium text-fogo-text">{me.actor.scopeRegion}</dd>
                        </div>
                      ) : null}
                      {me?.actor?.scopeOrg ? (
                        <div>
                          <dt className="text-xs text-fogo-muted">Órgão / unidade</dt>
                          <dd className="font-medium text-fogo-text">{me.actor.scopeOrg}</dd>
                        </div>
                      ) : null}
                      {me ? (
                        <>
                          <div>
                            <dt className="text-xs text-fogo-muted">Instalação</dt>
                            <dd className="font-medium text-fogo-text">{me.tenantName}</dd>
                          </div>
                          {me.cityName ? (
                            <div>
                              <dt className="text-xs text-fogo-muted">Município</dt>
                              <dd className="font-medium text-fogo-text">{me.cityName}</dd>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </dl>

                    <Button variant="ghost" size="sm" className="text-fogo-muted" onClick={() => void signOut()}>
                      Sair desta sessão
                    </Button>
                  </div>
                </div>
              )}
            </OpsPanel>
          ) : null}

          {tab === 'aparencia' ? (
            <OpsPanel title="Aparência" subtitle="Preferências visuais só deste navegador">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-fogo-text">
                    {theme === 'dark' ? 'Tema escuro' : 'Tema claro'}
                  </p>
                  <p className="mt-1 text-xs text-fogo-muted">
                    Escuro reduz fadiga em plantão; claro para salas muito iluminadas. A escolha fica salva neste dispositivo.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={theme === 'dark' ? 'primary' : 'outline'} onClick={() => setTheme('dark')}>
                    Escuro
                  </Button>
                  <Button size="sm" variant={theme === 'light' ? 'primary' : 'outline'} onClick={() => setTheme('light')}>
                    Claro
                  </Button>
                  <ThemeToggle showLabel />
                </div>
              </div>
            </OpsPanel>
          ) : null}

          {tab === 'seguranca' ? (
            <OpsPanel title="Segurança" subtitle="Redefinição de senha da sua conta no CCO">
              <form className="max-w-md space-y-4 p-4" onSubmit={(e) => void onChangePassword(e)}>
                <p className="text-xs leading-relaxed text-fogo-muted">
                  Informe a senha atual para confirmar a identidade. A nova senha precisa ter pelo menos 12 caracteres.
                </p>
                <label className="block">
                  <span className="text-sm font-medium">Senha atual</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Nova senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Confirmar nova senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
                  />
                </label>
                {turnstileSiteKey ? (
                  <TurnstileField siteKey={turnstileSiteKey} onToken={onTurnstile} className="min-h-[65px]" />
                ) : null}
                <Button type="submit" variant="primary" disabled={passwordBusy}>
                  {passwordBusy ? 'Alterando…' : 'Redefinir senha'}
                </Button>
              </form>
            </OpsPanel>
          ) : null}
    </>
  )
}
