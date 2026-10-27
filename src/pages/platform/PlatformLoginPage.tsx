import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FogoLogo } from '@/components/layout/FogoLogo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { bffLogin, bffSession, fetchAuthConfig } from '@/lib/authBff'
import { fetchPlatformMe } from '@/lib/tenantApi'
import { setApiTenantSlug } from '@/lib/apiTenant'
import { TurnstileField } from '@/components/auth/TurnstileField'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { markSessionEstablished } from '@/lib/sessionExpiry'

export function PlatformLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/mng'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)
  const [already, setAlready] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  useEffect(() => {
    setApiTenantSlug(null)
    void fetchAuthConfig().then((c) => setTurnstileSiteKey(c.turnstileSiteKey))
    void bffSession()
      .then(async (s) => {
        if (!s) return
        try {
          await fetchPlatformMe()
          setAlready(true)
        } catch {
          setAlready(false)
        }
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return <LoadScreen />
  }
  if (already) return <Navigate to={from} replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança abaixo.')
      return
    }
    setSubmitting(true)
    try {
      await bffLogin(email.trim(), password, turnstileToken ?? undefined)
      markSessionEstablished()
      await fetchPlatformMe()
      navigate(from, { replace: true })
    } catch (err) {
      const status = (err as Error & { status?: number }).status
      setError(
        status === 403
          ? 'Esta conta não é superadministrador da plataforma.'
          : err instanceof Error
            ? err.message
            : 'Falha no login',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-fogo-bg px-4">
      <div className="absolute left-4 top-4">
        <FogoLogo size="medium" />
      </div>
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-[380px] rounded-[20px] border border-fogo-border bg-fogo-surface px-6 py-6 shadow-fogo-card"
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-fogo-muted">Plataforma F.O.G.O.</p>
        <h1 className="mt-1.5 text-xl font-semibold text-fogo-text">Gerenciamento de cidades</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-fogo-muted">
          Acesso exclusivo ao superadministrador da plataforma.
        </p>
        <label className="mt-5 block">
          <span className="text-xs font-medium text-fogo-text">E-mail</span>
          <span className="relative mt-1 flex">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fogo-muted" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface py-2 pl-9 pr-3 text-sm"
            />
          </span>
        </label>
        <label className="mt-3.5 block">
          <span className="text-xs font-medium text-fogo-text">Senha</span>
          <span className="relative mt-1 flex">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fogo-muted" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface py-2 pl-9 pr-3 text-sm"
            />
          </span>
        </label>
        {turnstileSiteKey ? (
          <div className="mt-3.5 min-h-[68px] overflow-hidden">
            <TurnstileField siteKey={turnstileSiteKey} onToken={setTurnstileToken} size="flexible" className="w-full" />
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-xs leading-snug text-fogo-critical">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="mt-4 h-10 w-full" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}
