import { useCallback, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { completeFirstLoginPassword } from '@/lib/api'
import { TurnstileField } from '@/components/auth/TurnstileField'

export function FirstLoginPasswordGate() {
  const { profile, refreshProfile, signOut, authConfig } = useCcoAuth()
  const turnstileSiteKey = authConfig?.turnstileSiteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const onTurnstile = useCallback((t: string | null) => setTurnstileToken(t), [])
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 12) {
      setError('Use pelo menos 12 caracteres na nova senha.')
      return
    }
    if (newPassword !== confirm) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança.')
      return
    }
    setBusy(true)
    try {
      await completeFirstLoginPassword(newPassword, turnstileToken ?? undefined)
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a senha')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-fogo-overlay p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-login-password-title"
        className="w-full max-w-md rounded-fogo-lg border border-fogo-border bg-fogo-surface p-6 shadow-fogo-panel"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-fogo-md bg-fogo-accent/15 text-fogo-accent">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 id="first-login-password-title" className="text-lg font-semibold text-fogo-text">
              Defina sua senha
            </h1>
            <p className="text-xs text-fogo-muted">
              Primeiro acesso — {profile?.actor?.email ?? 'sua conta'}
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-fogo-muted">
          Por segurança, substitua a senha provisória definida pelo administrador antes de usar o CCO.
        </p>

        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="block">
            <span className="text-sm font-medium text-fogo-text">Nova senha</span>
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
            <span className="text-sm font-medium text-fogo-text">Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
            />
          </label>
          {turnstileSiteKey ? (
            <TurnstileField siteKey={turnstileSiteKey} onToken={onTurnstile} className="min-h-[65px]" />
          ) : null}
          {error ? (
            <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Salvando…' : 'Continuar para o CCO'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-fogo-muted hover:text-fogo-text"
          onClick={() => void signOut()}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
