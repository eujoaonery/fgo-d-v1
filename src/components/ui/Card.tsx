import { cn } from '@/lib/cn'

type CardProps = {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  style?: React.CSSProperties
} & (
  | { as?: 'div' | 'article'; onClick?: () => void }
  | { as: 'button'; onClick?: () => void; type?: 'button' | 'submit' }
)

export function Card(props: CardProps) {
  const { children, className, interactive, style } = props
  const Tag = props.as ?? 'div'
  const onClick = props.onClick
  const type = props.as === 'button' ? props.type ?? 'button' : undefined

  return (
    <Tag
      type={type}
      onClick={onClick}
      style={style}
      className={cn(
        'rounded-fogo-lg border border-fogo-border bg-fogo-surface shadow-fogo-card',
        interactive &&
          'cursor-pointer transition-[box-shadow,transform,border-color] duration-200 hover:border-fogo-gradient-from hover:shadow-[0_2px_8px_rgb(32_33_36_/0.08)] active:scale-[0.995]',
        onClick && Tag === 'div' && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
