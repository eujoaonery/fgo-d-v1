import { cn } from '@/lib/cn'

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'shrink-0 border-t border-fogo-border bg-fogo-bg px-4 py-2 lg:px-5',
        className,
      )}
    >
      <p className="text-center text-[11px] tabular-nums text-fogo-muted">Desenvolvido por João Nery</p>
    </footer>
  )
}
