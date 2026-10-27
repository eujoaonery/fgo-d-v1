import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  WEATHER_FILL,
  geoFromFrame,
  outlinePath,
  pointInMarilia,
  silhouetteFrame,
  weatherPatches,
  type WeatherPaintCell,
} from '@/lib/cityWeatherShape'

type Tip = { x: number; y: number; text: string }

export function CityWeatherSilhouette({ cells }: { cells: WeatherPaintCell[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const paintRef = useRef<{ patches: ReturnType<typeof weatherPatches>; frame: ReturnType<typeof silhouetteFrame> } | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const draw = () => {
      const cssW = wrap.clientWidth
      const cssH = wrap.clientHeight
      if (cssW < 8 || cssH < 8) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(cssW * ratio)
      canvas.height = Math.round(cssH * ratio)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)
      const frame = silhouetteFrame(cssW, cssH)
      const path = outlinePath(frame.drawW, frame.drawH)
      const stroke = getComputedStyle(document.documentElement).getPropertyValue('--fogo-text').trim() || '#202124'
      const trace = (context: CanvasRenderingContext2D) => {
        context.beginPath()
        path.forEach(([x, y], index) => {
          const px = frame.ox + x
          const py = frame.oy + y
          if (index === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        })
        context.closePath()
      }
      ctx.save()
      trace(ctx)
      ctx.clip()
      const patches = weatherPatches(cellsRef.current, frame.drawW, frame.drawH)
      paintRef.current = { patches, frame }
      if (patches.length === 0) {
        ctx.fillStyle = stroke
        ctx.globalAlpha = 0.08
        ctx.fillRect(frame.ox, frame.oy, frame.drawW, frame.drawH)
        ctx.globalAlpha = 1
      } else {
        for (const patch of patches) {
          ctx.fillStyle = WEATHER_FILL[patch.tone]
          ctx.fillRect(frame.ox + patch.x, frame.oy + patch.y, patch.w, patch.h)
        }
      }
      ctx.restore()
      trace(ctx)
      ctx.strokeStyle = stroke
      ctx.globalAlpha = 0.72
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [cells])

  function move(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const paint = paintRef.current
    if (!canvas || !wrap || !paint || cellsRef.current.length === 0) {
      setTip(null)
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const { frame, patches } = paint
    const localX = x - frame.ox
    const localY = y - frame.oy
    if (localX < 0 || localY < 0 || localX > frame.drawW || localY > frame.drawH) {
      setTip(null)
      return
    }
    const geo = geoFromFrame(localX, localY, frame)
    if (!pointInMarilia(geo.lat, geo.lng)) {
      setTip(null)
      return
    }
    const hit = patches.find((patch) => localX >= patch.x && localX < patch.x + patch.w && localY >= patch.y && localY < patch.y + patch.h)
    if (!hit) {
      setTip(null)
      return
    }
    setTip({ x, y, text: hit.label })
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-fogo-surface">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-label="Clima dentro do contorno de Marília"
        onMouseMove={move}
        onMouseLeave={() => setTip(null)}
      />
      {tip ? (
        <p
          className="pointer-events-none absolute z-10 max-w-[220px] rounded-fogo-md border border-fogo-border bg-fogo-surface px-2 py-1 text-[11px] text-fogo-text shadow-fogo-card"
          style={{ left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 240) - 228), top: Math.max(8, tip.y - 28) }}
        >
          {tip.text}
        </p>
      ) : null}
    </div>
  )
}
