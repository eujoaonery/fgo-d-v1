import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { ROUTES } from '@/lib/routes'
import { FirstLoginPasswordGate } from '@/components/auth/FirstLoginPasswordGate'
import { useCityHref } from '@/context/TenantContext'
import { AccessDeniedPage } from '@/pages/tenant/AccessDeniedPage'
import { LoadScreen } from '@/components/ui/LoadScreen'
export function CcoAuthGuard() {
  const { loading, profileLoading, accessDenied, session, profile, requireAuth, authConfigured } =
    useCcoAuth()
  const location = useLocation()
  const href = useCityHref()

  if (loading || (session && profileLoading)) {
    return <LoadScreen />
  }

  if (requireAuth && authConfigured && !session) {
    return (
      <Navigate
        to={href(ROUTES.login)}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  if (accessDenied) {
    return (
      <AccessDeniedPage message="Este usuário não está provisionado nesta cidade. Solicite ao administrador municipal a criação da conta e os privilégios necessários." />
    )
  }

  const mustChangePassword = profile?.mustChangePassword === true

  return (
    <>
      {mustChangePassword ? <FirstLoginPasswordGate /> : null}
      {!mustChangePassword ? <Outlet /> : null}
    </>
  )
}
