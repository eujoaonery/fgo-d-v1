import type { UrbanAsset } from '@/types'
import { Badge, statusVariant } from '@/components/ui/Badge'
import { AssetTruthBadges } from '@/components/ops/AssetTruthBadges'
import { cn } from '@/lib/cn'
import { iconForAssetCategory } from '@/lib/assetIcons'
import { assessAssetLifecycle } from '@/lib/assetLifecycle'
import { formatAssetAddress, resolveAssetLocation } from '@/lib/mariliaAddresses'

const thumbTone: Record<UrbanAsset['status'], string> = {
  operacional: 'from-fogo-gradient-to via-fogo-surface to-fogo-gradient-from',
  alerta: 'from-fogo-warning-bg via-fogo-warning/15 to-fogo-warning/25',
  inativo: 'from-fogo-bg via-fogo-border/40 to-fogo-muted/20',
}

interface AssetInventoryCardProps {
  asset: UrbanAsset
  selected?: boolean
  onSelect: () => void
}

export function AssetInventoryCard({ asset, selected, onSelect }: AssetInventoryCardProps) {
  const Icon = iconForAssetCategory(asset.category)
  const life = assessAssetLifecycle(asset)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col overflow-hidden rounded-fogo-lg border bg-fogo-surface text-left shadow-fogo-card transition-[border-color,box-shadow] duration-200',
        selected
          ? 'border-fogo-accent ring-2 ring-fogo-accent/25'
          : 'border-fogo-border hover:border-fogo-gradient-from hover:shadow-[0_2px_12px_rgb(32_33_36_/0.08)]',
      )}
    >
      <div
        className={cn(
          'relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br',
          thumbTone[asset.status],
        )}
      >
        <Icon className="h-10 w-10 text-fogo-accent/70" aria-hidden />
        <Badge variant={statusVariant(asset.status)} className="absolute bottom-2 left-2 text-[10px]">
          {asset.status}
        </Badge>
      </div>
      <div className="space-y-0.5 border-t border-fogo-border px-3 py-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-fogo-text">{asset.name}</p>
        <p className="text-[10px] uppercase tracking-wide text-fogo-muted">
          {asset.category}
          {asset.subtype ? ` · ${asset.subtype}` : ''}
        </p>
        <p className="font-mono text-[10px] text-fogo-accent">{asset.id}</p>
        {(asset.manufacturer || asset.model) && (
          <p className="truncate text-[10px] text-fogo-muted">
            {[asset.manufacturer, asset.model].filter(Boolean).join(' · ')}
          </p>
        )}
        {asset.serialNumber && (
          <p className="truncate font-mono text-[10px] text-fogo-muted">SN {asset.serialNumber}</p>
        )}
        <p className="line-clamp-2 text-[10px] text-fogo-muted">
          {(() => {
            const loc = resolveAssetLocation(asset)
            return loc ? formatAssetAddress(loc) : asset.address || 'Sem endereço gravado'
          })()}
        </p>
        {life?.overdueDays ? (
          <p className="text-[10px] text-fogo-critical">Preventiva atrasada {life.overdueDays}d</p>
        ) : life?.daysUntilDue != null && life.daysUntilDue <= 7 ? (
          <p className="text-[10px] text-fogo-warning">Preventiva em {life.daysUntilDue}d</p>
        ) : null}
        <div className="pt-1">
          <AssetTruthBadges asset={asset} />
        </div>
      </div>
    </button>
  )
}

export function AssetInventoryHero({ asset }: { asset: UrbanAsset }) {
  const Icon = iconForAssetCategory(asset.category)
  return (
    <div
      className={cn(
        'flex aspect-video items-center justify-center rounded-fogo-lg border border-fogo-border bg-gradient-to-br',
        thumbTone[asset.status],
      )}
    >
      <Icon className="h-16 w-16 text-fogo-accent/75" aria-hidden />
    </div>
  )
}
