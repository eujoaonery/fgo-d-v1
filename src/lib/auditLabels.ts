const ACTION_LABELS: Record<string, string> = {
  'asset.create': 'Cadastro de ativo',
  'asset.update': 'Alteração de ativo',
  'asset.delete': 'Exclusão de ativo',
  'team.create': 'Cadastro de agente',
  'team.update': 'Alteração de agente',
  'team.delete': 'Exclusão de agente',
  'maintenance.create': 'Nova ordem de manutenção (legado)',
  'maintenance.update': 'Atualização de manutenção (legado)',
  'maintenance.from_alert': 'Manutenção a partir de alerta (legado)',
  'incident.create': 'Nova ordem de serviço',
  'alert.transition': 'Transição de alerta',
  'alert.assume': 'Alerta assumido no CCO',
  'incident.from_alert': 'Ordem de serviço a partir de alerta',
  'incident.link_alerts': 'Alertas vinculados à ordem de serviço',
  'incident.dispatch': 'Despacho de agente',
  'incident.schedule': 'Agendamento de ordem de serviço',
  'incident.resolve': 'Resolução de ordem de serviço',
  'route.create': 'Rota operacional criada',
  'route.update': 'Rota operacional atualizada',
  'route.cancel': 'Rota operacional cancelada',
  'route.duplicate': 'Rota operacional duplicada',
  'operator.invite': 'Convite / criação de usuário',
  'operator.update': 'Alteração de papel, grupo ou escopo',
  'operator.remove': 'Remoção de usuário',
  'operator.activate': 'Reativação de usuário',
  'operator.deactivate': 'Inativação de usuário',
  'operator.session_revoke': 'Revogação de sessão',
  'group.create': 'Criação de grupo',
  'group.update': 'Alteração de grupo de usuários',
  'group.delete': 'Exclusão de grupo',
  'settings.simulation': 'Configuração de monitoramento',
  'monitoring.reset': 'Reset operacional',
  'profile.update': 'Atualização de perfil',
  'profile.password_first_login': 'Senha definida no primeiro acesso',
  'asset.import': 'Importação CSV de ativos',
  'team.import': 'Importação CSV de agentes',
}

export const AUDIT_ACTION_CODES = Object.keys(ACTION_LABELS)

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export function formatAuditDetail(metadata: Record<string, unknown>): string {
  const parts: string[] = []
  if (metadata.email) parts.push(String(metadata.email))
  if (metadata.name) parts.push(String(metadata.name))
  if (metadata.externalId) parts.push(String(metadata.externalId))
  if (metadata.protocol) parts.push(String(metadata.protocol))
  if (metadata.state) parts.push(`estado: ${metadata.state}`)
  if (metadata.groupId) parts.push(`grupo: ${metadata.groupId}`)
  if (metadata.role) parts.push(`papel: ${String(metadata.role)}`)
  if (metadata.scopeRegion) parts.push(`região: ${String(metadata.scopeRegion)}`)
  if (metadata.scopeOrg) parts.push(`órgão: ${String(metadata.scopeOrg)}`)
  if (metadata.reason) parts.push(`motivo: ${String(metadata.reason)}`)
  if (metadata.userId && !metadata.email) parts.push(`usuário: ${metadata.userId}`)
  if (parts.length) return parts.join(' · ')
  const keys = Object.keys(metadata).filter((k) => k !== 'actorEmail')
  if (keys.length === 0) return '—'
  return keys
    .slice(0, 4)
    .map((k) => `${k}: ${JSON.stringify(metadata[k])}`)
    .join(' · ')
}
