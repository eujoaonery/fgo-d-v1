import { Navigate, useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { useOpsData } from '@/context/OpsDataContext'
import { useCityHref } from '@/context/TenantContext'
import { OperatorsFloorTab } from '@/pages/operators/OperatorsFloorTab'
import { ROUTES } from '@/lib/routes'

const ADMIN_TABS = new Set(['usuarios', 'grupos', 'auditoria', 'logs'])

export function OperatorsPage() {
  const { apiConnected } = useOpsData()
  const href = useCityHref()
  const [params] = useSearchParams()
  const aba = params.get('aba')
  if (aba && ADMIN_TABS.has(aba)) {
    return <Navigate to={href(`${ROUTES.users}?aba=${aba}`)} replace />
  }

  return (
    <PageShell>
      <OperatorsFloorTab apiConnected={apiConnected} />
    </PageShell>
  )
}
