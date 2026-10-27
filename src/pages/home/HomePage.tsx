import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FogoLogo, FOGO_TAGLINE } from '@/components/layout/FogoLogo'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cityPath, validateTenantSlug } from '@/lib/tenant'
import { readRememberedTenantSlug } from '@/lib/apiTenant'
import { fetchPlatformMe } from '@/lib/tenantApi'
import { bffSession } from '@/lib/authBff'

export function HomePage() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState(() => readRememberedTenantSlug() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [platformReady, setPlatformReady] = useState(false)

  useEffect(() => {
    document.title = 'F.O.G.O.'
    void bffSession()
      .then(async (s) => {
        if (!s) return
        await fetchPlatformMe()
        setPlatformReady(true)
      })
      .catch(() => setPlatformReady(false))
  }, [])

  function goCity(e: React.FormEvent) {
    e.preventDefault()
    const parsed = validateTenantSlug(slug)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    window.location.assign(cityPath(parsed.slug, '/login'))
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-fogo-bg px-4 py-8">
      <div className="flex items-center justify-between">
        <FogoLogo size="medium" />
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-16 w-full max-w-lg flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fogo-text">F.O.G.O.</h1>
        <p className="mt-1 text-sm text-fogo-muted">{FOGO_TAGLINE}</p>
        <p className="mt-5 text-sm leading-relaxed text-fogo-text">
          Centro de comando urbano para prefeituras: mapa, alertas, ordens de serviço e equipes da cidade, num único
          CCO.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fogo-muted">
          Cada município tem o próprio endereço. A plataforma cuida das cidades, sem misturar dados entre elas.
        </p>

        <form className="mt-10 space-y-3" onSubmit={goCity}>
          <label className="block">
            <span className="text-sm font-medium text-fogo-text">CCO da cidade</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setError(null)
              }}
              placeholder="identificador-da-cidade"
              autoComplete="off"
              className="mt-1.5 h-11 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm"
            />
          </label>
          {error ? <p className="text-xs text-fogo-critical">{error}</p> : null}
          <Button type="submit" variant="primary" className="w-full">
            Abrir CCO
          </Button>
        </form>

        <div className="mt-8 border-t border-fogo-border pt-6">
          {platformReady ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/mng')}>
              Abrir gerenciamento de cidades
            </Button>
          ) : (
            <p className="text-sm text-fogo-muted">
              Superadministrador?{' '}
              <Link to="/mng/login" className="text-fogo-accent hover:underline">
                Entrar na plataforma
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
