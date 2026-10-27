import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCcoAccess } from '@/hooks/useCcoAccess'
import { CCO_MODULE_DEFS, moduleToPath, routeToModule } from '@/lib/ccoPermissions'
import { stripCityPrefix } from '@/lib/tenant'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'
import { LoadScreen } from '@/components/ui/LoadScreen'

export function CcoModuleGuard() {
  const { can, loading } = useCcoAccess()
  const location = useLocation()
  const href = useCityHref()
  const module = routeToModule(location.pathname)
  const logical = stripCityPrefix(location.pathname)
  const inventoryRoute = logical === '/inventario-cidade' || logical === '/ativos' || logical === '/frota'
  const allowed = inventoryRoute
    ? can('cityInventory', 'view') || can('assets', 'view')
    : !module || can(module, 'view')

  if (loading) {
    return <LoadScreen full={false} />
  }

  if (!allowed) {
    const alt = CCO_MODULE_DEFS.find((m) => can(m.key, 'view'))
    if (alt) {
      return <Navigate to={href(moduleToPath(alt.key))} replace />
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-fogo-text">Sem acesso ao CCO</p>
        <p className="max-w-md text-sm text-fogo-muted">
          Nenhum módulo foi liberado para este usuário. Solicite privilégios ao administrador da instalação.
        </p>
        <a href={href(ROUTES.login)} className="text-sm text-fogo-accent hover:underline">
          Voltar ao login
        </a>
      </div>
    )
  }

  return <Outlet />
}
