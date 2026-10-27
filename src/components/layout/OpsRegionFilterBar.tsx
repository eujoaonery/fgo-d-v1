import { OPS_REGIONS, useOpsFilter } from '@/context/OpsFilterContext'

export function OpsRegionFilterBar({ className }: { className?: string }) {
  const { region, setRegion } = useOpsFilter()
  return (
    <div className={className ?? 'mb-3 flex flex-wrap items-center gap-2'}>
      <span className="text-xs text-fogo-muted">Região:</span>
      <select
        className="rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      >
        <option value="">Todas</option>
        {OPS_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  )
}
