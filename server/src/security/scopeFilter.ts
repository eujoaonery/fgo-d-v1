import type { ResolvedActor } from '../permissions.js'
import type { Incident, MaintenanceOrder, OperationalAlert, OperationalTeam, UrbanAsset } from '../types.js'

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export function actorRegion(actor?: ResolvedActor): string | null {
  const r = actor?.scopeRegion?.trim()
  return r ? r : null
}

export function actorOrg(actor?: ResolvedActor): string | null {
  const o = actor?.scopeOrg?.trim()
  return o ? o : null
}

export function inActorScope(
  actor: ResolvedActor | undefined,
  rec: { region?: string | null; responsibleOrg?: string | null },
): boolean {
  if (!actor || actor.isPlatformSuperAdmin || actor.memberRole === 'admin') return true
  const region = actorRegion(actor)
  const org = actorOrg(actor)
  if (region && rec.region && rec.region !== region) return false
  if (org && rec.responsibleOrg && rec.responsibleOrg !== org) return false
  return true
}

function identityHints(actor?: ResolvedActor): string[] {
  return [actor?.displayName, actor?.email, actor?.userId].map(norm).filter(Boolean)
}

function assignedToActor(assignee: string | undefined, actor?: ResolvedActor): boolean {
  if (!assignee) return false
  const a = norm(assignee)
  return identityHints(actor).some((h) => a.includes(h) || h.includes(a))
}

export function filterAssetsForActor(items: UrbanAsset[], actor?: ResolvedActor): UrbanAsset[] {
  return items.filter((a) => inActorScope(actor, { region: a.region, responsibleOrg: a.responsibleOrg }))
}

export function filterIncidentsForActor(items: Incident[], actor?: ResolvedActor): Incident[] {
  const scoped = items.filter((i) => inActorScope(actor, { region: i.region }))
  if (actor?.memberRole !== 'field') return scoped
  return scoped.filter((i) => assignedToActor(i.assignee, actor) || assignedToActor(i.assignedTeamId, actor))
}

export function filterAlertsForActor(items: OperationalAlert[], actor?: ResolvedActor): OperationalAlert[] {
  return items.filter((a) => inActorScope(actor, { region: a.region }))
}

export function filterTeamsForActor(items: OperationalTeam[], actor?: ResolvedActor): OperationalTeam[] {
  const scoped = items.filter((t) => inActorScope(actor, { region: t.region }))
  if (actor?.memberRole === 'field') {
    const hints = identityHints(actor)
    const mine = scoped.filter((t) => t.members.some((m) => hints.some((h) => norm(m).includes(h) || h.includes(norm(m)))))
    if (mine.length) return mine
  }
  return scoped
}

export function filterMaintenanceForActor(items: MaintenanceOrder[], actor?: ResolvedActor): MaintenanceOrder[] {
  if (actor?.memberRole === 'maintenance' || actor?.memberRole === 'field') {
    const assigned = items.filter((m) => assignedToActor(m.assignee, actor))
    if (assigned.length) return assigned
  }
  return items
}

export function teamLocationVisible(actor?: ResolvedActor, shareUntil?: string | null): boolean {
  if (!actor) return false
  if (actor.memberRole !== 'field') return true
  if (!shareUntil) return false
  return new Date(shareUntil).getTime() > Date.now()
}
