import { Badge } from '@/components/ui/Badge'
import { DATA_ORIGIN_LABELS, originTone } from '@/lib/assetTruth'
import type { DataOrigin } from '@/types'

export function DataOriginBadge({ origin }: { origin?: DataOrigin | null }) {
  const value = origin ?? 'manual'
  return <Badge variant={originTone(value)}>{DATA_ORIGIN_LABELS[value]}</Badge>
}
