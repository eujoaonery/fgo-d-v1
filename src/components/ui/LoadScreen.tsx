import { cn } from '@/lib/cn'

type LoadScreenProps = {
  /** Preenche o viewport (gates de sessão/cidade). Sem isto, ocupa o espaço do layout. */
  full?: boolean
}

/** Tela de espera silenciosa: só a animação, sem texto visível. */
export function LoadScreen({ full = true }: LoadScreenProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-fogo-bg',
        full ? 'h-dvh min-h-dvh w-full' : 'min-h-[12rem] flex-1',
      )}
      role="status"
      aria-label="Carregando"
      aria-live="polite"
    >
      <span className="fogo-loadscreen" aria-hidden />
    </div>
  )
}
