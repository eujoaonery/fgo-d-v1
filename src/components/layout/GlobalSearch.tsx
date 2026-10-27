import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { searchOperational, type SearchHit } from '@/lib/api'
import { cn } from '@/lib/cn'

const kindLabel: Record<SearchHit['kind'], string> = {
  alert: 'Alerta',
  incident: 'Ordem de serviço',
  asset: 'Ativo',
  team: 'Agente',
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current)
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    debounce.current = window.setTimeout(() => {
      setLoading(true)
      void searchOperational(q.trim())
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setLoading(false))
    }, 280)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [q])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-xl flex-1 md:min-w-[280px]">
      <label className="relative block">
        <span className="sr-only">Busca global CCO</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fogo-muted" />
        <input
          type="search"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          placeholder="Protocolo, ativo, endereço, agente…"
          className="h-10 w-full rounded-fogo-md border border-fogo-border bg-fogo-surface/90 pl-10 pr-3 text-sm shadow-fogo-card placeholder:text-fogo-muted"
        />
      </label>
      {open && q.trim().length >= 2 ? (
        <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-y-auto rounded-fogo-md border border-fogo-border bg-fogo-surface py-1 shadow-fogo-panel">
          {loading ? (
            <li className="px-3 py-2 text-xs text-fogo-muted">Buscando…</li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-2 text-xs text-fogo-muted">Nenhum resultado.</li>
          ) : (
            hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-fogo-bg/80',
                  )}
                  onClick={() => {
                    setOpen(false)
                    setQ('')
                    navigate(h.path)
                  }}
                >
                  <span className="font-medium text-fogo-text">
                    {kindLabel[h.kind]} · {h.label}
                  </span>
                  {h.sublabel ? <span className="text-xs text-fogo-muted">{h.id} — {h.sublabel}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
