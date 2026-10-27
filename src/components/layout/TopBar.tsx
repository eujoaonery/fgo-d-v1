import { Bell, Search } from 'lucide-react'
import { routeMeta } from '@/lib/routes'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

interface TopBarProps {
  showPeriod?: boolean
  periodControl?: React.ReactNode
  primaryAction?: React.ReactNode
}

export function TopBar({ showPeriod, periodControl, primaryAction }: TopBarProps) {
  const { pathname } = useLocation()
  const { title, breadcrumbs } = routeMeta(pathname)

  return (
    <header className="sticky top-0 z-20 border-b border-fogo-border bg-fogo-bg/90 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-4 px-6 py-4 lg:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-fogo-text">{title}</h1>
          {breadcrumbs && breadcrumbs.length > 1 && (
            <p className="mt-0.5 text-sm text-fogo-muted">{breadcrumbs.join(' / ')}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="relative hidden md:block">
            <span className="sr-only">Buscar na operação</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fogo-muted" />
            <input
              type="search"
              placeholder="Buscar ativos, ocorrências…"
              className="h-9 w-56 rounded-fogo-md border border-fogo-border bg-fogo-surface pl-9 pr-3 text-sm text-fogo-text placeholder:text-fogo-muted lg:w-64"
            />
          </label>

          {showPeriod && periodControl}

          <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fogo-critical px-1 text-[10px] font-semibold text-white">
              3
            </span>
          </Button>

          {primaryAction}
        </div>
      </div>
    </header>
  )
}
