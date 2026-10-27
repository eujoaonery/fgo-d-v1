import { cn } from '@/lib/cn'

const LOGO_SRC = '/fogo-logo.png'

export const FOGO_TAGLINE = 'Ferramenta Onisciente de Gestão e Operações'

interface FogoLogoProps {
  className?: string
  /** Sidebar recolhida — wordmark menor */
  compact?: boolean
  /** Tamanho explícito (ex.: login). Ignora `compact` quando definido. */
  size?: 'medium' | 'sidebar'
}

/** Dimensões ~50% do wordmark anterior (sidebar 216→108px, login 144→72px). */
export function FogoLogo({ className, compact, size }: FogoLogoProps) {
  const isSidebar = size === 'sidebar' || (!size && !compact)
  const isMedium = size === 'medium'
  const isCompact = !size && compact

  return (
    <img
      src={LOGO_SRC}
      alt={`FOGO — ${FOGO_TAGLINE}`}
      width={isMedium ? 72 : isCompact ? 84 : 108}
      height={isMedium ? 24 : isCompact ? 30 : 36}
      className={cn(
        'shrink-0 object-contain object-left dark:brightness-0 dark:invert dark:opacity-90',
        isMedium && 'h-6 w-[72px]',
        isCompact && 'h-[30px] w-[84px] max-w-[31px] max-h-[11px]',
        isSidebar && 'h-9 w-[108px] max-w-full',
        className,
      )}
      decoding="async"
    />
  )
}
