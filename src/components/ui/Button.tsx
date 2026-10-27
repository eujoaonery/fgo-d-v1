import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-fogo-accent text-white hover:bg-fogo-accent-hover shadow-fogo-card disabled:opacity-50',
  secondary: 'bg-fogo-surface text-fogo-text border border-fogo-border hover:bg-fogo-bg',
  ghost: 'text-fogo-muted hover:bg-fogo-bg hover:text-fogo-text',
  outline: 'border border-fogo-border bg-fogo-surface hover:bg-fogo-bg text-fogo-text',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'xs' | 'sm' | 'md' | 'icon'
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-fogo-md font-medium transition-colors duration-200',
        'disabled:pointer-events-none',
        size === 'xs' && 'h-6 px-2 text-[11px] leading-none',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'icon' && 'h-9 w-9 p-0',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
