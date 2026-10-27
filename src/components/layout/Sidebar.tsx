import {
  BarChart3,
  Car,
  Map,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Package,
  Users,
  Activity,
  Plug,
  Bell,
  Cctv,
  Boxes,
  Brain,
  Sparkles,
  Orbit,
  Settings,
  UserCog,
  Contact,
  User,
  CalendarDays,
  ClipboardList,
  ListChecks,
  Radar,
  Route,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import type { CcoModuleKey } from '@/lib/ccoPermissions'
import { navigation } from '@/lib/routes'
import { cn } from '@/lib/cn'
import type { RouteKey } from '@/lib/routes'
import { FogoLogo, FOGO_TAGLINE } from '@/components/layout/FogoLogo'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { UserAvatar } from '@/components/profile/UserAvatar'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'
import { memberRoleLabel } from '@/lib/userDisplay'

const icons: Record<RouteKey, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  cameraMonitor: Cctv,
  cityInventory: Boxes,
  fleet: Car,
  incidents: ClipboardList,
  routes: Route,
  agenda: CalendarDays,
  alerts: Bell,
  forecasts: Sparkles,
  acao: ListChecks,
  assets: Package,
  teams: Users,
  techMonitor: Activity,
  analytics: BarChart3,
  regionVision: Map,
  predictiveIntel: Brain,
  prometheusAlpha: Orbit,
  strategy: Radar,
  integrations: Plug,
  operators: UserCog,
  users: Contact,
  settings: Settings,
  profile: User,
  login: Settings,
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

const navModuleKey: Partial<Record<RouteKey, CcoModuleKey>> = {
  overview: 'overview',
  cameraMonitor: 'cameraMonitor',
  cityInventory: 'cityInventory',
  incidents: 'incidents',
  routes: 'routes',
  agenda: 'incidents',
  alerts: 'alerts',
  forecasts: 'forecasts',
  acao: 'acao',
  assets: 'assets',
  teams: 'teams',
  techMonitor: 'techMonitor',
  predictiveIntel: 'predictiveIntel',
  prometheusAlpha: 'prometheusAlpha',
  analytics: 'analytics',
  regionVision: 'analytics',
  strategy: 'strategy',
  integrations: 'integrations',
  operators: 'operators',
  users: 'users',
  settings: 'settings',
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { can } = useCcoAccess()
  const { profile } = useCcoAuth()
  const href = useCityHref()
  const actor = profile?.actor
  return (
    <aside
      className={cn(
        'fogo-glass flex h-full shrink-0 flex-col border-r border-fogo-border/80 transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      <div className={cn('border-b border-fogo-border/80 px-3 py-4', collapsed && 'px-2 py-3')}>
        <div
          className={cn(
            'flex gap-2',
            collapsed ? 'items-center justify-center' : 'flex-col items-stretch',
          )}
        >
          <FogoLogo compact={collapsed} />
          {!collapsed && (
            <p className="text-[10px] leading-snug text-fogo-muted">{FOGO_TAGLINE}</p>
          )}
        </div>
      </div>

      <nav className="fogo-scroll-subtle flex-1 overflow-y-auto overflow-x-hidden px-2 py-3" aria-label="Principal">
        {navigation.map((group) => {
          const items = group.items.filter((item) => {
            if (item.id === 'cityInventory' || item.id === 'fleet') return can('cityInventory', 'view') || can('assets', 'view')
            const mod = navModuleKey[item.id]
            return !mod || can(mod, 'view')
          })
          if (items.length === 0) return null
          return (
          <div key={group.title} className="mb-4 last:mb-0">
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[11px] font-medium text-fogo-muted">{group.title}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = icons[item.id]
                return (
                  <li key={item.id}>
                    <NavLink
                      to={href(item.path)}
                      end={item.path === '/'}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-fogo-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-200',
                          collapsed && 'justify-center px-2',
                          isActive
                            ? 'fogo-gradient-panel text-fogo-accent shadow-fogo-card'
                            : 'text-fogo-muted hover:bg-fogo-hover-elevated hover:text-fogo-text',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {!collapsed && (
                        <span
                          className={cn(
                            'min-w-0 truncate',
                            item.id === 'predictiveIntel' && 'fogo-alpha-nav-label',
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )})}
      </nav>

      {profile?.isPlatformSuperAdmin && !collapsed ? (
        <div className="border-t border-fogo-border/80 px-3 py-2">
          <Link to="/mng" className="text-[11px] text-fogo-accent hover:underline">
            Gerenciamento de cidades
          </Link>
        </div>
      ) : null}

      <div className="border-t border-fogo-border/80 p-2">
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <Link
            to={href(ROUTES.profile)}
            title="Meu perfil"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-fogo-md px-1.5 py-1 transition-colors hover:bg-fogo-hover-elevated',
              collapsed && 'justify-center',
            )}
          >
            <UserAvatar
              size="sm"
              displayName={actor?.displayName}
              email={actor?.email}
              avatarUrl={actor?.avatarUrl}
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-fogo-text">
                  {actor?.displayName ?? actor?.email ?? 'Conta'}
                </p>
                <p className="truncate text-[10px] text-fogo-muted">{memberRoleLabel(actor?.role)}</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-fogo-md border border-fogo-border text-fogo-muted hover:bg-fogo-hover-elevated"
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
