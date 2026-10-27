export function userInitials(displayName: string | null | undefined, email?: string | null): string {
  const source = displayName?.trim() || email?.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export function memberStatusLabel(status: string | undefined): string {
  return status === 'inactive' ? 'Inativo' : 'Ativo'
}

export function memberRoleLabel(role: string | undefined): string {
  switch (role) {
    case 'admin':
      return 'Administrador de cidade'
    case 'manager':
      return 'Gestor de mobilidade'
    case 'operator':
      return 'Operador da central'
    case 'maintenance':
      return 'Equipe de manutenção'
    case 'field':
      return 'Agente de campo'
    case 'auditor':
      return 'Auditor / consulta'
    case 'viewer':
      return 'Auditor / consulta'
    default:
      return role ?? 'Membro'
  }
}
