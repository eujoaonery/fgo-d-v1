import { Badge } from '@/components/ui/Badge'
import {
  CADASTRAL_LABELS,
  CONNECTIVITY_LABELS,
  cadastralTone,
  connectivityTone,
  deriveConnectivity,
  normalizeCadastral,
} from '@/lib/assetTruth'
import type { UrbanAsset } from '@/types'

export function AssetTruthBadges({
  asset,
}: {
  asset: Pick<UrbanAsset, 'lastSeen' | 'cadastralStatus' | 'category'>
}) {
  const cad = normalizeCadastral(asset.cadastralStatus)
  const conn = deriveConnectivity(asset)
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={cadastralTone(cad)}>{CADASTRAL_LABELS[cad]}</Badge>
      <Badge variant={connectivityTone(conn)}>{CONNECTIVITY_LABELS[conn]}</Badge>
    </span>
  )
}
