import { OpsHeader } from '@/components/layout/OpsHeader'
import { cn } from '@/lib/cn'

interface PageShellProps {
  children: React.ReactNode
  className?: string
  header?: React.ReactNode
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  flush?: boolean
  /** Quando falso, o miolo não rola: a página controla o scroll para o conteúdo não cobrir o que está acima. */
  scroll?: boolean
}

export function PageShell({
  children,
  className,
  header,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  flush,
  scroll = true,
}: PageShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header ?? (
        <OpsHeader
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
        />
      )}
      <main
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          flush ? 'overflow-hidden' : scroll ? 'overflow-y-auto p-4 lg:p-5' : 'overflow-hidden p-4 lg:p-5',
          className,
        )}
      >
        {children}
      </main>
    </div>
  )
}
