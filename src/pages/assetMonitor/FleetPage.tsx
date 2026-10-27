import { PageShell } from '@/components/layout/PageShell'
import { FleetPanel } from '@/components/assets/FleetPanel'
import { useCcoAccess } from '@/hooks/useCcoAccess'

export function FleetPage() {
  const { can } = useCcoAccess()
  return (
    <PageShell>
      <div className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-fogo-text">Frota</h2>
          <p className="mt-0.5 text-xs text-fogo-muted">
            Viaturas, motos e demais veículos já cadastrados no inventário da cidade.
          </p>
        </div>
        <FleetPanel canManage={can('assets', 'manage')} />
      </div>
    </PageShell>
  )
}
