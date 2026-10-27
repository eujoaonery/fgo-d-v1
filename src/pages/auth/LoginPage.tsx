import { useCallback, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { fetchApiMe, reportAuthEvent } from '@/lib/api'
import { setApiTenantSlug } from '@/lib/apiTenant'
import { ROUTES } from '@/lib/routes'
import { useOptionalTenant } from '@/context/TenantContext'
import { operationModeLabel } from '@/lib/tenant'
import { cn } from '@/lib/cn'
import { FogoLogo } from '@/components/layout/FogoLogo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { TurnstileField } from '@/components/auth/TurnstileField'

export function LoginPage() {
  const { signIn, loading, session, profile, authConfigured, authConfig } = useCcoAuth()
  const turnstileSiteKey = authConfig?.turnstileSiteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const onTurnstile = useCallback((t: string | null) => setTurnstileToken(t), [])
  const navigate = useNavigate()
  const location = useLocation()
  const tenant = useOptionalTenant()
  const home = tenant ? tenant.href('/') : ROUTES.overview
  const fromRaw = (location.state as { from?: string } | null)?.from
  const from = fromRaw && !fromRaw.endsWith('/login') ? fromRaw : home

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session && profile?.actor && !profile.mustChangePassword) {
    if (profile.isPlatformSuperAdmin) {
      return <Navigate to="/mng" replace />
    }
    return <Navigate to={from} replace />
  }

  if (!authConfigured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-fogo-bg p-4">
        <p className="text-sm text-fogo-muted">Serviço de autenticação indisponível. Contacte o administrador.</p>
      </div>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança abaixo.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password, turnstileToken ?? undefined)
      const me = await fetchApiMe()
      if (me.isPlatformSuperAdmin) {
        setApiTenantSlug(null)
        navigate('/mng', { replace: true })
        return
      }
      navigate(from, { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no login'
      setError(msg)
      void reportAuthEvent({ type: 'login_failed', email: email.trim(), error: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-fogo-bg px-4 py-12 md:px-8">
      <div className="absolute left-4 top-4 z-30 flex items-start gap-3 md:left-8 md:top-8">
        <FogoLogo size="medium" />
        <ThemeToggle className="mt-0.5" />
      </div>
      <div className="relative w-full max-w-[1200px] animate-[fadeUp_0.4s_ease-out] md:min-h-[640px]">
        {/* Painel cidade — atrás */}
        <div className="relative z-10 flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[24px] p-8 pb-16 text-white shadow-[0_24px_80px_rgb(32_33_36_/0.16)] md:absolute md:top-12 md:bottom-12 md:left-0 md:w-[62%] md:p-9 md:pr-[8%] lg:top-14 lg:bottom-14">
          <div className="absolute inset-0" aria-hidden>
            <img
              src="/login-city.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
            />
          </div>
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#071018]/72 via-[#0c1929]/28 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071018]/55 via-transparent to-[#071018]/25" aria-hidden />

          <div className="relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#CEEAF7]">Centro de Operações</p>
            <h2 className="mt-5 max-w-md text-3xl font-semibold leading-snug tracking-tight md:text-[2rem]">
              F.O.G.O.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75 md:text-[15px]">
              {tenant
                ? `${tenant.publicTenant.cityName} — ${operationModeLabel(tenant.publicTenant.operationMode)}.`
                : 'Ferramenta Onisciente de Gestão e Operações — monitoramento urbano em tempo real.'}
            </p>
          </div>

          <ul className="relative z-10 mt-10 hidden space-y-3.5 text-sm text-white/80 md:block">
            {[
              'Mapa na visão geral e inventário da cidade',
              'Ocorrências, alertas e equipes em campo',
              'Inteligência e configurações do CCO',
            ].map((line, i) => (
              <li key={line} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#CEEAF7]/20 text-[10px] font-bold text-[#CEEAF7]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Formulário — por cima do painel esquerdo */}
        <div
          className={cn(
            'relative z-20 mx-auto -mt-10 flex w-[calc(100%-2rem)] max-w-[400px] flex-col rounded-[20px] border border-fogo-border/60 bg-fogo-surface px-8 py-8 shadow-[0_24px_56px_rgb(32_33_36_/0.16)]',
            'md:absolute md:left-[54%] md:right-6 md:top-1/2 md:mx-0 md:-mt-0 md:max-w-[380px] md:-translate-y-1/2 lg:left-[55%] lg:right-10',
          )}
        >
          {forgotOpen ? (
            <div className="w-full">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="mb-6 text-sm text-fogo-accent hover:underline"
              >
                ← Voltar ao login
              </button>
              <p className="text-[11px] font-medium uppercase tracking-wide text-fogo-muted">Recuperação de acesso</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fogo-text">Verifique com o administrador</h1>
              <p className="mt-3 text-sm leading-relaxed text-fogo-muted">
                Não há auto-cadastro nem redefinição de senha pelo sistema. Entre em contato com o administrador da
                instalação municipal para redefinir credenciais ou liberar seu acesso ao CCO.
              </p>
              <div className="mt-6 rounded-fogo-md border border-fogo-border bg-fogo-bg px-4 py-3 text-sm text-fogo-text">
                Se você já possui conta e esqueceu a senha, solicite uma nova senha ao responsável pela plataforma na
                prefeitura.
              </div>
            </div>
          ) : (
            <div className="w-full">
              <p className="text-[10px] font-medium uppercase tracking-wide text-fogo-muted">Acessar minha conta</p>
              <h1 className="mt-1.5 text-[1.65rem] font-semibold tracking-tight text-fogo-text">Entrar</h1>
              <p className="mt-1.5 text-xs leading-relaxed text-fogo-muted">
                {tenant
                  ? `Acesso ao CCO de ${tenant.publicTenant.cityName}.`
                  : 'Bem-vindo de volta. Use seu e-mail e senha para continuar no CCO.'}
              </p>
              <form className="mt-5 space-y-3.5" onSubmit={(e) => void onSubmit(e)}>
                <label className="block">
                  <span className="text-xs font-medium text-fogo-text">E-mail</span>
                  <span className="relative mt-1 flex">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fogo-muted" />
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      placeholder="seu.email@prefeitura.gov.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface py-2 pl-9 pr-3 text-sm placeholder:text-fogo-muted/60 focus:border-fogo-accent/50 focus:outline-none focus:ring-2 focus:ring-fogo-accent/15"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="flex items-center justify-between text-xs font-medium text-fogo-text">
                    Senha
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-[11px] font-normal text-fogo-accent hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </span>
                  <span className="relative mt-1 flex">
                    <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fogo-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface py-2 pl-9 pr-10 text-sm placeholder:text-fogo-muted/60 focus:border-fogo-accent/50 focus:outline-none focus:ring-2 focus:ring-fogo-accent/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-fogo-sm text-fogo-muted hover:bg-fogo-bg hover:text-fogo-text"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                </label>

                {turnstileSiteKey ? (
                  <div className="min-h-[68px] overflow-hidden">
                    <TurnstileField
                      siteKey={turnstileSiteKey}
                      onToken={onTurnstile}
                      size="flexible"
                      className="w-full"
                    />
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-xs leading-snug text-fogo-critical">
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  className="h-10 w-full text-sm font-semibold"
                  disabled={submitting || loading}
                >
                  {submitting ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="hidden md:block md:min-h-[640px]" aria-hidden />
      </div>
    </div>
  )
}
