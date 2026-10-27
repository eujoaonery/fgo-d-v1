import { useState } from 'react'
import type { CameraFeed } from '@/types'
import { cn } from '@/lib/cn'
import { VideoOff } from 'lucide-react'

interface CameraFeedImageProps {
  camera: CameraFeed
  className?: string
  showLiveBadge?: boolean
  assetId?: boolean
}

export function CameraFeedImage({
  camera,
  className,
  showLiveBadge = true,
  assetId = true,
}: CameraFeedImageProps) {
  const [failed, setFailed] = useState(false)
  const offline = camera.status === 'offline'

  return (
    <div className={cn('relative overflow-hidden bg-[#1e293b]', className)}>
      {!offline && !failed ? (
        <img
          src={camera.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover contrast-[1.05] saturate-[0.92]"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full min-h-[60px] w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
          <VideoOff className="h-6 w-6 text-slate-400" aria-hidden />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
      {showLiveBadge && (
        <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/50 px-1 py-0.5 text-[8px] font-medium text-white backdrop-blur-sm">
          {offline || failed ? (
            <>
              <VideoOff className="h-2.5 w-2.5" aria-hidden />
              Sem sinal
            </>
          ) : (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50 motion-reduce:animate-none" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Ao vivo
            </>
          )}
        </div>
      )}
      {assetId && (
        <div className="absolute bottom-1 right-1 rounded bg-black/45 px-1 text-[8px] tabular-nums text-white/90">
          {camera.assetId}
        </div>
      )}
    </div>
  )
}
