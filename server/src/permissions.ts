import type { CcoMemberRole, CcoModuleKey, CcoPermissions } from '../../src/lib/ccoPermissions.js'
import {
  canAccessModule,
  fullPermissions,
  intersectPermissions,
  normalizeMemberRole,
  parsePermissionsJson,
  parseRawPermissions,
  permissionsAreEmpty,
  permissionsForRole,
} from '../../src/lib/ccoPermissions.js'

export type ResolvedActor = {
  userId: string
  email?: string
  role: string
  permissions: CcoPermissions
  isPlatformSuperAdmin: boolean
  memberRole?: CcoMemberRole
  scopeRegion?: string | null
  scopeOrg?: string | null
  locationShareUntil?: string | null
  displayName?: string | null
}

export function resolveActorPermissions(
  role: string,
  permissionsJson: unknown,
  isPlatformSuperAdmin: boolean,
): CcoPermissions {
  if (isPlatformSuperAdmin) return fullPermissions()
  return parsePermissionsJson(permissionsJson, normalizeMemberRole(role))
}

/**
 * Privilégios efetivos §5: papel define o teto; grupo só restringe (nunca amplia).
 * Grupo vazio cai no preset do papel.
 */
export function resolveMemberPermissions(
  memberRole: CcoMemberRole,
  permissionsJson: unknown,
  groupPermissionsJson?: unknown | null,
): CcoPermissions {
  const role = normalizeMemberRole(memberRole)
  const preset = permissionsForRole(role)
  if (groupPermissionsJson != null) {
    const granted = parseRawPermissions(groupPermissionsJson, { inheritMissingExport: true })
    if (!permissionsAreEmpty(granted)) {
      const merged = intersectPermissions(preset, granted)
      const rawHadForecasts = typeof groupPermissionsJson === 'object' && groupPermissionsJson != null && 'forecasts' in groupPermissionsJson
      if (!rawHadForecasts && preset.forecasts.view) merged.forecasts = { ...preset.forecasts }
      return merged
    }
  }
  if (role === 'admin') return fullPermissions()
  return parsePermissionsJson(permissionsJson, role)
}

export function actorCan(
  actor: ResolvedActor | undefined,
  module: CcoModuleKey,
  action: 'view' | 'manage' | 'export',
): boolean {
  if (!actor) return false
  return canAccessModule(actor.permissions, module, action, {
    isPlatformSuperAdmin: actor.isPlatformSuperAdmin,
    memberRole: actor.memberRole,
  })
}

export function actorCanManageSla(actor: ResolvedActor | undefined): boolean {
  if (!actor) return false
  if (actor.isPlatformSuperAdmin) return true
  const role = normalizeMemberRole(actor.memberRole ?? actor.role)
  return role === 'admin' || role === 'manager'
}
