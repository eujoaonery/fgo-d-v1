import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Clock, LayoutDashboard, Server, Shield, UserCog } from 'lucide-react'
import { FogoLogo, FOGO_TAGLINE } from '@/components/layout/FogoLogo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { OpsTabBar } from '@/components/layout/OpsTabBar'
import { Button } from '@/components/ui/Button'
import { bffLogout } from '@/lib/authBff'
import { setApiTenantSlug } from '@/lib/apiTenant'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/mng', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/mng/cidades', label: 'Cidades', icon: Building2, match: '/mng/cidades' },
  { to: '/mng/administradores', label: 'SuperADMs', icon: UserCog },
  { to: '/mng/infraestrutura', label: 'Infraestrutura', icon: Server },
  { to: '/mng/firewall', label: 'Firewall', icon: Shield },
  { to: '/mng/sessoes', label: 'Sessões', icon: Clock },
] as const

function navActive(pathname: string, item: (typeof NAV)[number]) {
  if ('match' in item && item.match) return pathname === item.match || pathname.startsWith(`${item.match}/`)
  if ('end' in item && item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function PlatformLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    setApiTenantSlug(null)
  }, [])

  async function signOut() {
    setApiTenantSlug(null)
    await bffLogout().catch(() => undefined)
    navigate('/mng/login', { replace: true })
  }

  return (
    <div className="flex min-h-dvh bg-fogo-bg">
      <aside className="fogo-glass hidden w-[220px] shrink-0 flex-col border-r border-fogo-border/80 md:flex">
        <div className="border-b border-fogo-border/80 px-3 py-4">
          <FogoLogo size="sidebar" className="h-11 w-[140px] max-w-full" />
          <p className="mt-2 text-[10px] leading-snug text-fogo-muted">{FOGO_TAGLINE}</p>
        </div>
        <nav className="fogo-scroll-subtle flex-1 overflow-y-auto overflow-x-hidden px-2 py-3" aria-label="Plataforma">
          <p className="mb-1.5 px-2 text-[11px] font-medium text-fogo-muted">Administração</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = navActive(pathname, item)
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item ? item.end : false}
                    className={cn(
                      'flex items-center gap-2.5 rounded-fogo-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-200',
                      active
                        ? 'fogo-gradient-panel text-fogo-accent shadow-fogo-card'
                        : 'text-fogo-muted hover:bg-fogo-hover-elevated hover:text-fogo-text',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-fogo-border/80 px-3 py-3">
          <Link to="/" className="text-[11px] text-fogo-accent hover:underline">
            Início
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="fogo-glass flex items-center justify-between gap-3 border-b border-fogo-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fogo-text">Plataforma</p>
            <p className="truncate text-[11px] text-fogo-muted">Superadministração das cidades</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button type="button" className="text-xs text-fogo-muted hover:text-fogo-text" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </header>

        <OpsTabBar className="border-b border-fogo-border px-3 py-2 md:hidden" aria-label="Seções da plataforma">
          {NAV.map((item) => (
            <Button
              key={item.to}
              size="sm"
              variant={navActive(pathname, item) ? 'primary' : 'outline'}
              className={cn('shrink-0 whitespace-nowrap', !navActive(pathname, item) && 'bg-fogo-surface')}
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </Button>
          ))}
        </OpsTabBar>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
