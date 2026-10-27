import { cn } from '@/lib/cn'

export type AlertKpiValues = {
  total: number
  pending: number
  resolved: number
  assumed: number
  solved: number
}

const CARDS: Array<{
  key: keyof AlertKpiValues
  label: string
  hint: string
  tone?: 'warn' | 'ok' | 'me'
}> = [
  { key: 'total', label: 'Total de ocorrências', hint: 'Todos os registros' },
  { key: 'pending', label: 'Pendentes', hint: 'Alertas de ocorrências em aberto', tone: 'warn' },
  { key: 'resolved', label: 'Fora da fila', hint: 'OS aberta, resolvido ou alarme falso', tone: 'ok' },
  { key: 'assumed', label: 'Assumidas', hint: 'As que você assumiu e seguem pendentes', tone: 'me' },
  { key: 'solved', label: 'Solucionadas', hint: 'As que você concluiu', tone: 'me' },
]

const QUEUE_KEYS = new Set<keyof AlertKpiValues>(['total', 'pending', 'assumed', 'solved'])

export function AlertKpiStrip({
  values,
  variant = 'full',
}: {
  values: AlertKpiValues
  variant?: 'full' | 'queue'
}) {
  const cards = variant === 'queue' ? CARDS.filter((card) => QUEUE_KEYS.has(card.key)) : CARDS
  return (
    <div
      className={cn(
        'grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-fogo-lg border border-fogo-border bg-fogo-border',
        variant === 'queue' ? 'lg:grid-cols-4' : 'sm:grid-cols-3 xl:grid-cols-5',
      )}
    >
      {cards.map((card) => (
        <div key={card.key} className="bg-fogo-surface px-4 py-3">
          <p className="text-xs text-fogo-muted">{card.label}</p>
          <p
            className={cn(
              'mt-1 font-mono text-2xl font-semibold tabular-nums',
              card.tone === 'warn' && values.pending > 0 && 'text-fogo-warning',
              card.tone === 'ok' && 'text-fogo-success',
              card.tone === 'me' && 'text-fogo-accent',
              !card.tone && 'text-fogo-text',
            )}
          >
            {values[card.key]}
          </p>
          <p className="mt-0.5 text-[10px] text-fogo-muted">{card.hint}</p>
        </div>
      ))}
    </div>
  )
}
