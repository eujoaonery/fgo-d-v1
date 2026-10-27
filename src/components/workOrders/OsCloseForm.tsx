import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Incident, OsCloseImage } from '@/types'

function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = value
    }
  }, [value])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height }
  }

  function emit() {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={96}
        className="h-24 w-full touch-none rounded-fogo-md border border-fogo-border bg-white"
        onPointerDown={(e) => {
          drawing.current = true
          const ctx = canvasRef.current?.getContext('2d')
          const p = pos(e)
          ctx?.beginPath()
          ctx?.moveTo(p.x, p.y)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvasRef.current?.getContext('2d')
          const p = pos(e)
          ctx?.lineTo(p.x, p.y)
          ctx?.stroke()
        }}
        onPointerUp={() => {
          drawing.current = false
          emit()
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="mt-1"
        onClick={() => {
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx) return
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          onChange('')
        }}
      >
        Limpar assinatura
      </Button>
    </div>
  )
}

export function OsCloseForm({
  incident,
  busy,
  onSave,
}: {
  incident: Incident
  busy: boolean
  onSave: (fields: {
    diagnosis?: string
    materials?: string
    closeProblem?: string
    closeSolution?: string
    closeSignature?: string
    closeImages?: OsCloseImage[]
    status?: 'resolvida'
  }) => Promise<void>
}) {
  const [diagnosis, setDiagnosis] = useState(incident.diagnosis ?? '')
  const [materials, setMaterials] = useState(incident.materials ?? '')
  const [problem, setProblem] = useState(incident.closeProblem ?? '')
  const [solution, setSolution] = useState(incident.closeSolution ?? '')
  const [signature, setSignature] = useState(incident.closeSignature ?? '')
  const [images, setImages] = useState<OsCloseImage[]>(incident.closeImages ?? [])

  useEffect(() => {
    setDiagnosis(incident.diagnosis ?? '')
    setMaterials(incident.materials ?? '')
    setProblem(incident.closeProblem ?? '')
    setSolution(incident.closeSolution ?? '')
    setSignature(incident.closeSignature ?? '')
    setImages(incident.closeImages ?? [])
  }, [incident.id])

  async function readFiles(files: FileList | null) {
    if (!files) return
    const next = [...images]
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') || next.length >= 6) continue
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      if (dataUrl.length > 2_000_000) continue
      next.push({ fileName: file.name.slice(0, 160), contentType: file.type, dataUrl })
    }
    setImages(next)
  }

  const payload = {
    diagnosis,
    materials,
    closeProblem: problem,
    closeSolution: solution,
    closeSignature: signature,
    closeImages: images,
  }

  return (
    <div className="space-y-2 rounded-fogo-md border border-fogo-border p-3 text-xs">
      <p className="font-medium text-fogo-text">Execução e fechamento</p>
      <p className="text-fogo-muted">Problema, solução, fotos e assinatura são opcionais — a OS pode ser finalizada em branco.</p>
      <label className="block">
        Diagnóstico
        <textarea
          className="mt-1 min-h-[48px] w-full rounded-fogo-md border border-fogo-border px-2 py-1"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
        />
      </label>
      <label className="block">
        Materiais / peças
        <textarea
          className="mt-1 min-h-[48px] w-full rounded-fogo-md border border-fogo-border px-2 py-1"
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
        />
      </label>
      <label className="block">
        Problema encontrado
        <textarea
          className="mt-1 min-h-[48px] w-full rounded-fogo-md border border-fogo-border px-2 py-1"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        />
      </label>
      <label className="block">
        Solução aplicada
        <textarea
          className="mt-1 min-h-[48px] w-full rounded-fogo-md border border-fogo-border px-2 py-1"
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
        />
      </label>
      <label className="block">
        Evidências (imagens)
        <input
          type="file"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-[11px]"
          onChange={(e) => void readFiles(e.target.files)}
        />
      </label>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {images.map((img, idx) => (
            <button
              key={`${img.fileName}-${idx}`}
              type="button"
              className="relative"
              onClick={() => setImages((list) => list.filter((_, i) => i !== idx))}
              title="Remover"
            >
              <img src={img.dataUrl} alt={img.fileName} className="h-14 w-14 rounded object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-fogo-muted">Assinatura</p>
        <SignaturePad value={signature} onChange={setSignature} />
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onSave(payload)}
        >
          Salvar evidências
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void onSave({ ...payload, status: 'resolvida' })}>
          Finalizar ordem de serviço
        </Button>
      </div>
    </div>
  )
}
