import { useMemo } from 'react'
import { useCcoAuth } from '@/context/CcoAuthContext'
import {
  canAccessModule,
  emptyPermissions,
  type CcoAccessAction,
  type CcoMemberRole,
  type CcoModuleKey,
  type CcoPermissions,
} from '@/lib/ccoPermissions'

export function useCcoAccess() {
  const { profile, profileLoading } = useCcoAuth()

  const permissions: CcoPermissions = profile?.permissions ?? emptyPermissions()
  const memberRole = (profile?.actor?.role ?? 'auditor') as CcoMemberRole

  const isPlatformSuperAdmin = profile?.isPlatformSuperAdmin === true
  const can = useMemo(
    () => (module: CcoModuleKey, action: CcoAccessAction = 'view') =>
      canAccessModule(permissions, module, action, { memberRole, isPlatformSuperAdmin }),
    [permissions, memberRole, isPlatformSuperAdmin],
  )

  return {
    loading: profileLoading,
    permissions,
    role: memberRole,
    can,
  }
}
