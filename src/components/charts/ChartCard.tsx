import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

interface ChartCardProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ChartCard({ title, description, action, children, className }: ChartCardProps) {
  return (
    <Card className={cn('flex flex-col p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fogo-text">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-fogo-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="min-h-[220px] flex-1">{children}</div>
    </Card>
  )
}
