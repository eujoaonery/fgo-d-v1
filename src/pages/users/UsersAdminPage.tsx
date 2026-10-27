import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { OpsTabBar } from '@/components/layout/OpsTabBar'
import { TabLoadScreen } from '@/components/ui/TabLoadScreen'
import { Button } from '@/components/ui/Button'
import { useOpsData } from '@/context/OpsDataContext'
import { OperatorsUsersTab } from '@/pages/operators/OperatorsUsersTab'
import { OperatorsGroupsTab } from '@/pages/operators/OperatorsGroupsTab'
import { OperatorsAuditTab } from '@/pages/operators/OperatorsAuditTab'
import { OperatorsLogsTab } from '@/pages/operators/OperatorsLogsTab'
import { cn } from '@/lib/cn'

type Tab = 'usuarios' | 'grupos' | 'auditoria' | 'logs'

function parseTab(raw: string | null): Tab {
  if (raw === 'grupos') return 'grupos'
  if (raw === 'auditoria') return 'auditoria'
  if (raw === 'logs') return 'logs'
  return 'usuarios'
}

export function UsersAdminPage() {
  const { apiConnected } = useOpsData()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('aba'))

  function setTab(next: Tab) {
    setParams(next === 'usuarios' ? {} : { aba: next }, { replace: true })
  }

  const tabs: Array<[Tab, string]> = [
    ['usuarios', 'Usuários'],
    ['grupos', 'Grupos de usuários'],
    ['auditoria', 'Auditoria'],
    ['logs', 'Logs'],
  ]

  return (
    <PageShell scroll={false}>
      <OpsTabBar className="z-20 mb-4 shrink-0 bg-fogo-bg" aria-label="Abas de usuários">
        {tabs.map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? 'primary' : 'outline'}
            className={cn('shrink-0 whitespace-nowrap', tab !== id && 'bg-fogo-surface')}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </OpsTabBar>
      <div className="fogo-scroll-subtle min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <TabLoadScreen key={tab} ready={apiConnected}>
      {tab === 'usuarios' ? (
        <OperatorsUsersTab apiConnected={apiConnected} />
      ) : tab === 'grupos' ? (
        <OperatorsGroupsTab apiConnected={apiConnected} />
      ) : tab === 'auditoria' ? (
        <OperatorsAuditTab apiConnected={apiConnected} />
      ) : (
        <OperatorsLogsTab apiConnected={apiConnected} />
      )}
      </TabLoadScreen>
      </div>
    </PageShell>
  )
}
