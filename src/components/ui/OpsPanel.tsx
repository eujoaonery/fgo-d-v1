import { cn } from '@/lib/cn'

interface OpsPanelProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  compact?: boolean
  /** Sem corte: o card cresce com o conteúdo e não cobre o que está acima. */
  flow?: boolean
}

export function OpsPanel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  compact,
  flow,
}: OpsPanelProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-fogo-lg border border-fogo-border bg-fogo-surface/95 shadow-fogo-card',
        flow ? 'h-auto overflow-visible' : 'overflow-hidden',
        className,
      )}
    >
      <header
        className={cn(
          'flex items-start justify-between gap-2 border-b border-fogo-border/80 px-3 py-2.5',
          compact && 'py-2',
        )}
      >
        <div>
          <h3 className="text-xs font-semibold text-fogo-text">{title}</h3>
          {subtitle ? <p className="text-[10px] text-fogo-muted">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className={cn(flow ? 'h-auto' : 'min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}
