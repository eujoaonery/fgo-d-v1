import { Search, Settings } from 'lucide-react'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { OpsNotificationBell } from '@/components/layout/OpsNotificationBell'
import { Link, useLocation } from 'react-router-dom'
import { routeMeta, ROUTES } from '@/lib/routes'
import { useLiveClock } from '@/hooks/useLiveClock'
import { useOpsData } from '@/context/OpsDataContext'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { cn } from '@/lib/cn'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useCityHref } from '@/context/TenantContext'
import { CitySwitcher } from '@/components/layout/DemoModeBanner'
import { operationModeLabel } from '@/lib/tenant'

interface OpsHeaderProps {
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  trailing?: React.ReactNode
  dense?: boolean
}

export function OpsHeader({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar por endereço, ativo ou ocorrência…',
  trailing,
  dense,
}: OpsHeaderProps) {
  const { pathname } = useLocation()
  const { title } = routeMeta(pathname)
  const clock = useLiveClock()
  const { apiStatus, simulation } = useOpsData()
  const { session, signOut, authConfigured, profile } = useCcoAuth()
  const href = useCityHref()

  const simOn = simulation?.enabled === true

  const statusLine =
    apiStatus === 'offline'
      ? 'API indisponível'
      : simOn
        ? 'Monitoramento ativo'
        : null

  return (
    <header className="fogo-glass sticky top-0 z-30 shrink-0 border-b border-fogo-border/80">
      <div className={cn('flex flex-wrap items-center gap-3 px-4 py-3 lg:px-5', dense && 'py-2.5')}>
        <div className="min-w-[120px]">
          <p className="text-sm font-semibold text-fogo-text">{title}</p>
          {statusLine ? (
            <p
              className={cn(
                'text-[11px]',
                simOn ? 'text-fogo-accent' : 'text-fogo-warning',
              )}
            >
              {statusLine}
            </p>
          ) : null}
        </div>

        {onSearchChange ? (
          <label className="relative mx-auto w-full max-w-xl flex-1 md:min-w-[280px]">
            <span className="sr-only">Busca operacional</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fogo-muted" />
            <input
              type="search"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface/90 pl-10 pr-3 text-sm shadow-fogo-card placeholder:text-fogo-muted"
            />
          </label>
        ) : (
          <GlobalSearch />
        )}

        <div className="ml-auto flex items-center gap-2">
          <time className="hidden text-xs tabular-nums text-fogo-muted lg:block" dateTime={clock}>
            {clock}
          </time>
          {trailing}
          {profile?.tenant ? (
            <span className="hidden max-w-[180px] truncate text-[11px] text-fogo-muted sm:inline">
              {profile.cityName ?? profile.tenant.name} · {operationModeLabel(profile.tenant.operationMode)}
            </span>
          ) : null}
          <CitySwitcher />
          <ThemeToggle />
          <OpsNotificationBell />
          {authConfigured && !session ? (
            <Link
              to={href(ROUTES.login)}
              className="hidden text-xs text-fogo-accent hover:underline sm:inline"
            >
              Entrar
            </Link>
          ) : null}
          {session ? (
            <button
              type="button"
              className="hidden text-xs text-fogo-muted hover:text-fogo-text sm:inline"
              onClick={() => void signOut()}
            >
              Sair
            </button>
          ) : null}
          <Link
            to={href(ROUTES.settings)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-fogo-md text-fogo-muted transition-colors hover:bg-fogo-bg hover:text-fogo-text"
            aria-label="Configurações"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
