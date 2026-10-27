import type { ChartPeriod } from '@/types'
import { cn } from '@/lib/cn'

const options: { value: ChartPeriod; label: string }[] = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
]

interface PeriodSelectProps {
  value: ChartPeriod
  onChange: (value: ChartPeriod) => void
  className?: string
}

export function PeriodSelect({ value, onChange, className }: PeriodSelectProps) {
  return (
    <div
      className={cn(
        'inline-flex rounded-fogo-md border border-fogo-border bg-fogo-surface p-0.5',
        className,
      )}
      role="group"
      aria-label="Período"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-200',
            value === opt.value
              ? 'fogo-gradient-panel text-fogo-accent shadow-fogo-card'
              : 'text-fogo-muted hover:text-fogo-text',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
