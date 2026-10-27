import { X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  width?: 'md' | 'lg' | 'xl'
}

export function Drawer({ open, onClose, title, subtitle, children, width = 'md' }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 bg-fogo-overlay-soft transition-opacity duration-200"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={cn(
          'relative flex h-full max-w-full flex-col border-l border-fogo-border bg-fogo-surface shadow-xl',
          'translate-x-0 transition-transform duration-200 motion-reduce:transition-none',
          width === 'md' && 'w-full sm:w-[420px]',
          width === 'lg' && 'w-full sm:w-[480px]',
          width === 'xl' && 'w-full sm:w-[560px]',
        )}
      >
        <header className="fogo-gradient-panel flex shrink-0 items-start justify-between gap-3 border-b border-fogo-border px-5 py-4">
          <div>
            <h2 id="drawer-title" className="text-lg font-semibold text-fogo-text">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-fogo-muted">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  )
}
