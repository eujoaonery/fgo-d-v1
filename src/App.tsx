import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { CcoAuthGuard } from '@/components/auth/CcoAuthGuard'
import { CcoModuleGuard } from '@/components/auth/CcoModuleGuard'
import { CcoAuthProvider } from '@/context/CcoAuthContext'
import { TenantGate, useTenant } from '@/context/TenantContext'
import { OverviewPage } from '@/pages/overview/OverviewPage'
import { IncidentsPage } from '@/pages/incidents/IncidentsPage'
import { RoutesPage } from '@/pages/routing/RoutesPage'
import { AgendaPage } from '@/pages/agenda/AgendaPage'
import { CityInventoryPage } from '@/pages/assetMonitor/CityInventoryPage'
import { FleetPage } from '@/pages/assetMonitor/FleetPage'
import { TeamsPage } from '@/pages/teams/TeamsPage'
import { IntegrationsPage } from '@/pages/integrations/IntegrationsPage'
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage'
import { RegionVisionPage } from '@/pages/analytics/RegionVisionPage'
import { CameraMonitorPage } from '@/pages/cameras/CameraMonitorPage'
import { PredictiveIntelPage } from '@/pages/predictive/PredictiveIntelPage'
import { ForecastsPage } from '@/pages/forecasts/ForecastsPage'
import { PrometheusAlphaPage } from '@/pages/alpha/PrometheusAlphaPage'
import { StrategyPage } from '@/pages/strategy/StrategyPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { OperatorsPage } from '@/pages/operators/OperatorsPage'
import { UsersAdminPage } from '@/pages/users/UsersAdminPage'
import { AlertsPage } from '@/pages/alerts/AlertsPage'
import { AcaoPage } from '@/pages/acao/AcaoPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ROUTES } from '@/lib/routes'
import { RootRedirect } from '@/pages/tenant/RootRedirect'
import { PlatformGuard } from '@/pages/platform/PlatformGuard'
import { PlatformLayout } from '@/pages/platform/PlatformLayout'
import { PlatformLoginPage } from '@/pages/platform/PlatformLoginPage'
import { CitiesAdminPage } from '@/pages/platform/CitiesAdminPage'
import { CityFormPage } from '@/pages/platform/CityFormPage'
import { CityDuplicatePage } from '@/pages/platform/CityDuplicatePage'
import { PlatformInfraPage } from '@/pages/platform/PlatformInfraPage'
import { PlatformFirewallPage } from '@/pages/platform/PlatformFirewallPage'
import { PlatformOverviewPage } from '@/pages/platform/PlatformOverviewPage'
import { PlatformSessionPage } from '@/pages/platform/PlatformSessionPage'
import { CityAdminsPage } from '@/pages/platform/CityAdminsPage'

function child(route: string) {
  return route.replace(/^\//, '')
}

function CityHomeRedirect() {
  const { href } = useTenant()
  return <Navigate to={href('/')} replace />
}

function CityIncidentsRedirect() {
  const { href } = useTenant()
  return <Navigate to={href(ROUTES.incidents)} replace />
}

function CityAssetsRedirect() {
  const { href } = useTenant()
  const { search } = useLocation()
  return <Navigate to={`${href(ROUTES.cityInventory)}${search}`} replace />
}

function CityAlertsRedirect() {
  const { href } = useTenant()
  return <Navigate to={href(ROUTES.alerts)} replace />
}

function CcoRoot() {
  return (
    <CcoAuthProvider>
      <Outlet />
    </CcoAuthProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/mng/login" element={<PlatformLoginPage />} />
      <Route element={<PlatformGuard />}>
        <Route element={<PlatformLayout />}>
          <Route path="/mng" element={<PlatformOverviewPage />} />
          <Route path="/mng/infraestrutura" element={<PlatformInfraPage />} />
          <Route path="/mng/firewall" element={<PlatformFirewallPage />} />
          <Route path="/mng/sessoes" element={<PlatformSessionPage />} />
          <Route path="/mng/administradores" element={<CityAdminsPage />} />
          <Route path="/mng/cidades" element={<CitiesAdminPage />} />
          <Route path="/mng/cidades/nova" element={<CityFormPage />} />
          <Route path="/mng/cidades/:tenantId" element={<CityFormPage />} />
          <Route path="/mng/cidades/:tenantId/duplicar" element={<CityDuplicatePage />} />
        </Route>
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<RootRedirect />} />

      <Route path="/:citySlug" element={<TenantGate />}>
        <Route element={<CcoRoot />}>
          <Route path="login" element={<LoginPage />} />
          <Route element={<CcoAuthGuard />}>
            <Route element={<CcoModuleGuard />}>
              <Route element={<AppLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="mapa" element={<CityHomeRedirect />} />
                <Route path={child(ROUTES.cameraMonitor)} element={<CameraMonitorPage />} />
                <Route path={child(ROUTES.cityInventory)} element={<CityInventoryPage />} />
                <Route path={child(ROUTES.fleet)} element={<FleetPage />} />
                <Route path={child(ROUTES.incidents)} element={<IncidentsPage />} />
                <Route path="ocorrencias" element={<CityIncidentsRedirect />} />
                <Route path={child(ROUTES.routes)} element={<RoutesPage />} />
                <Route path={child(ROUTES.agenda)} element={<AgendaPage />} />
                <Route path={child(ROUTES.alerts)} element={<AlertsPage />} />
                <Route path={child(ROUTES.forecasts)} element={<ForecastsPage />} />
                <Route path={child(ROUTES.acao)} element={<AcaoPage />} />
                <Route path={child(ROUTES.assets)} element={<CityAssetsRedirect />} />
                <Route path={child(ROUTES.teams)} element={<TeamsPage />} />
                <Route path="manutencao" element={<CityIncidentsRedirect />} />
                <Route path={child(ROUTES.techMonitor)} element={<CityAlertsRedirect />} />
                <Route path={child(ROUTES.integrations)} element={<IntegrationsPage />} />
                <Route path={child(ROUTES.predictiveIntel)} element={<PredictiveIntelPage />} />
                <Route path={child(ROUTES.prometheusAlpha)} element={<PrometheusAlphaPage />} />
                <Route path={child(ROUTES.analytics)} element={<AnalyticsPage />} />
                <Route path={child(ROUTES.regionVision)} element={<RegionVisionPage />} />
                <Route path={child(ROUTES.strategy)} element={<StrategyPage />} />
                <Route path={child(ROUTES.settings)} element={<SettingsPage />} />
                <Route path={child(ROUTES.profile)} element={<ProfilePage />} />
                <Route path={child(ROUTES.operators)} element={<OperatorsPage />} />
                <Route path={child(ROUTES.users)} element={<UsersAdminPage />} />
                <Route path="*" element={<CityHomeRedirect />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
