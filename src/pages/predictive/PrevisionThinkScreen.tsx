import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

const LINES = [
  'Lendo o histórico de alertas',
  'Cruzando hora, dia e região',
  'Medindo o ritmo deste dia',
  'Fechando as próximas horas',
]

type Point = { x: number; y: number; z: number }
type Node = Point & { strand: number }
type RibbonAxis = 'x' | 'z' | 'd'
type Strand = {
  axis: RibbonAxis
  origin: Point
  dir: 1 | -1
  phase: number
}

const WEAVE: { nodes: Node[]; strands: Strand[]; links: Array<[number, number]> } = (() => {
  const nodes: Node[] = []
  const strands: Strand[] = []
  const ranges: Array<{ start: number; count: number }> = []

  const addRibbon = (axis: RibbonAxis, lane: number, lanes: number, count: number, dir: 1 | -1) => {
    const strand = strands.length
    const start = nodes.length
    const sideGap = 0.07
    let ox = 0
    let oy = 0
    let oz = 0
    const place = (i: number, side: number): Point => {
      const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
      const wave = Math.sin(u * Math.PI * 1.65 + lane * 0.9) * 0.36
      const lift = Math.cos(u * Math.PI * 2.3 + lane * 1.15) * 0.1
      const lanePos = ((lane + 0.5) / lanes - 0.5) * 1.45
      if (axis === 'x') {
        return { x: u * 1.55, y: lanePos + lift + side * sideGap, z: wave + side * 0.02 }
      }
      if (axis === 'z') {
        return { x: wave * 0.85 + side * sideGap, y: lanePos * 0.85 + lift, z: u * 1.05 }
      }
      return {
        x: u * 1.28 + side * 0.04,
        y: lanePos * 0.7 + wave * 0.22,
        z: u * 0.7 + side * sideGap,
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const p = place(i, side)
        ox += p.x
        oy += p.y
        oz += p.z
        nodes.push({ ...p, strand })
      }
    }
    const total = count * 2
    strands.push({
      axis,
      origin: { x: ox / total, y: oy / total, z: oz / total },
      dir,
      phase: lane * 0.7 + (axis === 'z' ? 1.4 : axis === 'd' ? 2.3 : 0),
    })
    ranges.push({ start, count })
  }

  for (let lane = 0; lane < 6; lane++) addRibbon('x', lane, 6, 26, lane % 2 === 0 ? 1 : -1)
  for (let lane = 0; lane < 5; lane++) addRibbon('z', lane, 5, 22, lane % 2 === 0 ? -1 : 1)
  for (let lane = 0; lane < 4; lane++) addRibbon('d', lane, 4, 20, lane % 2 === 0 ? 1 : -1)

  const links: Array<[number, number]> = []
  const seen = new Set<string>()
  const add = (i: number, j: number) => {
    if (i === j) return
    const lo = Math.min(i, j)
    const hi = Math.max(i, j)
    const key = `${lo}-${hi}`
    if (seen.has(key)) return
    seen.add(key)
    links.push([lo, hi])
  }
  for (const range of ranges) {
    const { start, count } = range
    for (let i = 0; i < count - 1; i++) {
      add(start + i, start + i + 1)
      add(start + count + i, start + count + i + 1)
      add(start + i, start + count + i)
    }
    add(start + count - 1, start + count * 2 - 1)
  }
  for (let a = 0; a < nodes.length; a++) {
    const near: Array<{ b: number; d: number }> = []
    const pa = nodes[a]!
    for (let b = a + 1; b < nodes.length; b++) {
      const pb = nodes[b]!
      if (pa.strand === pb.strand) continue
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)
      if (d < 0.42) near.push({ b, d })
    }
    near.sort((p, q) => p.d - q.d)
    for (const n of near.slice(0, 3)) add(a, n.b)
  }
  return { nodes, strands, links }
})()

function twistStrand(p: Point, strand: Strand, angle: number): Point {
  const x = p.x - strand.origin.x
  const y = p.y - strand.origin.y
  const z = p.z - strand.origin.z
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  let rx = x
  let ry = y
  let rz = z
  if (strand.axis === 'x') {
    ry = y * c - z * s
    rz = y * s + z * c
  } else if (strand.axis === 'z') {
    rx = x * c - y * s
    ry = x * s + y * c
  } else {
    const ax = 0.7071
    const az = 0.7071
    const dot = ax * x + az * z
    const cx = -az * y
    const cy = az * x - ax * z
    const cz = ax * y
    const one = 1 - c
    rx = x * c + cx * s + ax * dot * one
    ry = y * c + cy * s
    rz = z * c + cz * s + az * dot * one
  }
  return { x: rx + strand.origin.x, y: ry + strand.origin.y, z: rz + strand.origin.z }
}

function rotate(p: Point, yaw: number, pitch: number, roll: number): Point {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  let x = p.x * cy + p.z * sy
  let z = -p.x * sy + p.z * cy
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const y1 = p.y * cp - z * sp
  z = p.y * sp + z * cp
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const x2 = x * cr - y1 * sr
  const y2 = x * sr + y1 * cr
  return { x: x2, y: y2, z }
}

function MeshCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let alive = true
    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const paint = (now: number) => {
      if (!alive) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, rect.width)
      const h = Math.max(1, rect.height)
      const bw = Math.floor(w * dpr)
      const bh = Math.floor(h * dpr)
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const dark = document.documentElement.classList.contains('dark')
      const accent = dark ? '#4eb6ff' : '#0b84ff'
      const t = reduce ? 1.2 : now / 1000
      const floatY = Math.sin(t * 0.42) * (h * 0.035)
      const span = Math.min(w, h) * 0.44
      const camera = 3.1

      const projected = WEAVE.nodes.map((p, index) => {
        const strand = WEAVE.strands[p.strand]!
        const spun = twistStrand(p, strand, t * 0.16 * strand.dir + strand.phase)
        const r = rotate(
          spun,
          0,
          Math.sin(t * 0.11 + strand.phase) * 0.22,
          Math.sin(t * 0.07 + strand.phase * 0.7) * 0.18,
        )
        const depth = camera / (camera - r.z)
        return {
          x: w / 2 + r.x * span * depth,
          y: h / 2 + r.y * span * depth + floatY,
          z: r.z,
          depth,
          index,
        }
      })

      const byZ = [...projected].sort((a, b) => a.z - b.z)
      for (const [ia, ib] of WEAVE.links) {
        const a = projected[ia]
        const b = projected[ib]
        if (!a || !b) continue
        const z = (a.z + b.z) / 2
        const alpha = 0.07 + ((z + 1.15) / 2.3) * 0.34
        ctx.strokeStyle = accent
        ctx.globalAlpha = Math.max(0.05, Math.min(0.48, alpha))
        ctx.lineWidth = 0.65 + ((z + 1.15) / 2.3) * 0.7
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      for (const p of byZ) {
        const glow = 0.55 + Math.sin(t * 0.9 + p.index * 0.17) * 0.45
        const alpha = 0.28 + ((p.z + 1.15) / 2.3) * 0.72
        ctx.fillStyle = accent
        ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha * glow))
        ctx.beginPath()
        ctx.arc(p.x, p.y, (1.05 + ((p.z + 1.15) / 2.3) * 1.55) * p.depth, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (!reduce) raf = window.requestAnimationFrame(paint)
    }

    raf = window.requestAnimationFrame(paint)
    return () => {
      alive = false
      window.cancelAnimationFrame(raf)
    }
  }, [])

  return <canvas ref={ref} className="prevision-mesh" />
}

export function PrevisionThinkScreen({
  failed,
  onRetry,
}: {
  failed: boolean
  onRetry: () => void
}) {
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (failed) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), 2200)
    return () => window.clearInterval(id)
  }, [failed])

  return (
    <div
      className="prevision-think flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10"
      role="status"
      aria-live="polite"
      aria-label={failed ? 'Não foi possível carregar a previsão' : 'Prevision Engine cruzando os dados'}
    >
      <div className="prevision-think-stage" aria-hidden>
        <MeshCanvas />
      </div>
      <p className="mt-8 text-sm font-semibold text-fogo-text">Prevision Engine</p>
      <p className="mt-1 max-w-sm text-center text-sm text-fogo-muted">
        {failed ? 'Não foi possível cruzar os dados agora.' : LINES[line]}
      </p>
      {failed ? (
        <Button type="button" size="sm" variant="outline" className="mt-4" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  )
}
