import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppFooter } from '@/components/layout/AppFooter'
import { AssetDossierHost } from '@/components/assets/AssetDossierDrawer'
import { OpsDataProvider } from '@/context/OpsDataContext'
import { OpsFilterProvider } from '@/context/OpsFilterContext'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <OpsDataProvider>
      <OpsFilterProvider>
        <div className="flex h-dvh min-h-screen overflow-hidden bg-fogo-bg">
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet context={{ sidebarCollapsed: collapsed }} />
            </div>
            <AppFooter />
          </div>
        </div>
        <AssetDossierHost />
      </OpsFilterProvider>
    </OpsDataProvider>
  )
}
