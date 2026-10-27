import type { CameraFeed } from '@/types'
import { cn } from '@/lib/cn'
import { CameraFeedImage } from '@/components/cameras/CameraFeedImage'

interface CameraTileProps {
  camera: CameraFeed
  selected?: boolean
  onSelect?: () => void
}

export function CameraTile({ camera, selected, onSelect }: CameraTileProps) {
  const Tag = onSelect ? 'button' : 'div'

  return (
    <Tag
      type={onSelect ? 'button' : undefined}
      onClick={onSelect}
      className={cn(
        'group relative flex aspect-video w-full flex-col overflow-hidden rounded-md border text-left transition-[border-color,box-shadow] duration-200',
        selected
          ? 'border-fogo-accent ring-2 ring-fogo-accent/30'
          : 'border-fogo-border hover:border-fogo-gradient-from hover:shadow-fogo-card',
      )}
    >
      <CameraFeedImage camera={camera} className="min-h-0 flex-1" />
      <div className="shrink-0 border-t border-fogo-border/80 bg-fogo-surface px-1.5 py-1">
        <p className="truncate text-[9px] font-medium leading-tight text-fogo-text">{camera.label}</p>
        <p className="truncate text-[8px] text-fogo-muted">{camera.region}</p>
      </div>
      <span
        className={cn(
          'absolute right-1 top-1 z-10 h-2 w-2 rounded-full border border-white/80',
          camera.status === 'online' && 'bg-fogo-success',
          camera.status === 'alerta' && 'bg-fogo-warning',
          camera.status === 'offline' && 'bg-fogo-muted',
        )}
        title={camera.status}
        aria-hidden
      />
    </Tag>
  )
}
