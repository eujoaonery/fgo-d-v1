import { cn } from '@/lib/cn'
import { userInitials } from '@/lib/userDisplay'

interface UserAvatarProps {
  displayName?: string | null
  email?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-12 w-12 text-sm',
  lg: 'h-20 w-20 text-xl',
}

export function UserAvatar({ displayName, email, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const initials = userInitials(displayName, email)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn('shrink-0 rounded-full border border-fogo-border object-cover', sizes[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-fogo-border bg-fogo-gradient-from font-semibold text-fogo-accent',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}
