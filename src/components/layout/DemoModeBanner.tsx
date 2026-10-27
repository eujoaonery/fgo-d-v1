import { Link } from 'react-router-dom'
import { useCcoAuth } from '@/context/CcoAuthContext'
import { useOptionalTenant } from '@/context/TenantContext'

export function RealAwaitingDataBanner({ empty }: { empty: boolean }) {
  const { profile } = useCcoAuth()
  if (profile?.tenant?.operationMode !== 'real' || !empty) return null
  return (
    <div className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 py-2 text-sm text-fogo-muted">
      Aguardando configuração de dados. Esta cidade está em operação real e ainda não possui fontes conectadas. A
      ausência de indicadores é uma condição normal até a integração ser validada.
    </div>
  )
}

export function CitySwitcher() {
  const { profile } = useCcoAuth()
  const tenant = useOptionalTenant()
  if (!profile?.isPlatformSuperAdmin) return null
  return (
    <Link
      to="/mng"
      className="hidden text-[11px] text-fogo-muted hover:text-fogo-accent sm:inline"
      title="Gerenciamento de cidades"
    >
      {tenant?.publicTenant.name ?? profile.tenantName} · cidades
    </Link>
  )
}
