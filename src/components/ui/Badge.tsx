import { cn } from '@/lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'critical' | 'neutral'

const variants: Record<BadgeVariant, string> = {
  default: 'bg-fogo-gradient-to/80 text-fogo-accent border-fogo-gradient-from/60',
  success: 'bg-fogo-success-bg text-fogo-success border-fogo-success/30',
  warning: 'bg-fogo-warning-bg text-fogo-warning border-fogo-warning/35',
  critical: 'bg-fogo-critical-bg text-fogo-critical border-fogo-critical/35',
  neutral: 'bg-fogo-bg text-fogo-muted border-fogo-border',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function priorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'crítica':
      return 'critical'
    case 'alta':
      return 'warning'
    case 'média':
      return 'default'
    default:
      return 'neutral'
  }
}

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'resolvida':
      return 'success'
    case 'em atendimento':
    case 'em deslocamento':
      return 'default'
    case 'agendada':
    case 'planejada':
    case 'triagem':
      return 'default'
    case 'aguardando material':
    case 'aberta':
      return 'warning'
    case 'cancelada':
      return 'neutral'
    default:
      return 'neutral'
  }
}
