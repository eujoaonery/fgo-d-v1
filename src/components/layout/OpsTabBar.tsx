import { cn } from '@/lib/cn'

/** Barra de abas com o mesmo scroll sutil da sidebar, na horizontal. */
export function OpsTabBar({
  children,
  className,
  'aria-label': ariaLabel = 'Seções',
}: {
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'fogo-scroll-subtle min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain',
        className,
      )}
    >
      <div className="flex w-max min-w-full flex-nowrap gap-1 py-0.5 pr-1">{children}</div>
    </div>
  )
}

/** Corpo da aba em página flush — mesmo scroll vertical da sidebar. */
export function OpsFlushBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('fogo-scroll-subtle min-h-0 flex-1 overflow-y-auto overflow-x-hidden', className)}>
      {children}
    </div>
  )
}
