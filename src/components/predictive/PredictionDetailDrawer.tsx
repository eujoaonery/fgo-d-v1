import { useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Badge } from '@/components/ui/Badge'
import type { PredictionRecord } from '@/lib/api'
import {
  isPredictionActive,
  predictionAction,
  predictionFacts,
  predictionHeadline,
  predictionPeriodLabel,
  predictionRiskLabel,
} from '@/lib/predictionView'
export function PredictionDetailDrawer({
  prediction,
  onClose,
}: {
  prediction: PredictionRecord | null
  onClose: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    setShowDetails(false)
  }, [prediction?.id])

  if (!prediction) return null
  const active = isPredictionActive(prediction)
  const headline = predictionHeadline(prediction)
  const action = predictionAction(prediction)
  const facts = predictionFacts(prediction)
  const place = prediction.region?.trim() || 'Cidade inteira'

  return (
    <>
      <Drawer open onClose={onClose} title="Previsão" subtitle={place} width="md">
        <div className="space-y-4 text-sm">
          <p className="text-[15px] leading-relaxed text-fogo-text">{headline}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-fogo-prevision-bg px-2 py-0.5 text-[11px] text-fogo-prevision">
              Risco {predictionRiskLabel(prediction.probability)}
            </span>
            <Badge variant={active ? 'warning' : 'neutral'}>{active ? 'Vigente' : 'Encerrada'}</Badge>
            <Badge variant="neutral">{predictionPeriodLabel(prediction)}</Badge>
          </div>
          {action ? (
            <p className="rounded-fogo-md border border-fogo-prevision/25 bg-fogo-prevision-bg px-3 py-2 text-xs leading-relaxed text-fogo-text">
              {action}
            </p>
          ) : null}

          <button
            type="button"
            className="text-xs font-medium text-fogo-prevision hover:underline"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>

          {showDetails ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-fogo-md border border-fogo-border/80 bg-fogo-bg/40 px-3 py-3 text-xs">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-fogo-muted">{fact.label}</dt>
                  <dd className="mt-0.5 text-fogo-text">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

        </div>
      </Drawer>
    </>
  )
}
