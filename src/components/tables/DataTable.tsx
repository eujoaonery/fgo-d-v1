import { cn } from '@/lib/cn'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  emptyMessage?: string
  dense?: boolean
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = 'Nenhum registro encontrado.',
  dense = false,
}: DataTableProps<T>) {
  const cell = dense ? 'px-3 py-1' : 'px-4 py-2.5'
  return (
    <div className="overflow-x-auto rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-fogo-card">
      <table className={cn('w-full min-w-[720px] text-left', dense ? 'text-xs' : 'text-sm')}>
        <thead>
          <tr className="border-b border-fogo-border bg-fogo-bg/70 text-xs text-fogo-muted">
            {columns.map((col) => (
              <th key={col.key} className={cn(cell, 'font-medium', col.className)}>
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-fogo-text"
                    onClick={() => onSort(col.key)}
                  >
                    {col.header}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-fogo-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-b border-fogo-border last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-fogo-bg/80',
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(cell, 'leading-tight', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
