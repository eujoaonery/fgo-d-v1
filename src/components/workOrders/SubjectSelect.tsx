import { useEffect, useState } from 'react'
import {
  createWorkOrderSubject,
  fetchWorkOrderSubjects,
  type WorkOrderSubject,
} from '@/lib/api'

export function SubjectSelect({
  value,
  onChange,
  canCreate,
  disabled,
}: {
  value: string
  onChange: (id: string, subject?: WorkOrderSubject) => void
  canCreate?: boolean
  disabled?: boolean
}) {
  const [subjects, setSubjects] = useState<WorkOrderSubject[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchWorkOrderSubjects()
      .then((rows) => {
        if (!cancelled) setSubjects(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar assuntos')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function addSubject() {
    const name = newName.trim()
    if (name.length < 3) {
      setError('Informe um assunto com pelo menos 3 caracteres.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await createWorkOrderSubject(name)
      setSubjects((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')))
      onChange(created.id, created)
      setNewName('')
      setCreating(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o assunto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="text-fogo-muted">Assunto da OS</span>
        <select
          required
          disabled={disabled}
          className="mt-1 h-9 w-full rounded-fogo-md border border-fogo-border px-2"
          value={value}
          onChange={(e) => {
            const id = e.target.value
            onChange(id, subjects.find((s) => s.id === id))
          }}
        >
          <option value="">Selecione o assunto</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {canCreate ? (
        creating ? (
          <div className="flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-fogo-md border border-fogo-border px-2 text-sm"
              placeholder="Novo assunto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addSubject()
                }
              }}
            />
            <button
              type="button"
              className="h-9 shrink-0 rounded-fogo-md bg-fogo-accent px-3 text-xs font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void addSubject()}
            >
              {busy ? '…' : 'Salvar'}
            </button>
          </div>
        ) : (
          <button type="button" className="text-[11px] text-fogo-accent hover:underline" onClick={() => setCreating(true)}>
            Criar novo assunto
          </button>
        )
      ) : null}
      {error ? <p className="text-[11px] text-fogo-critical">{error}</p> : null}
    </div>
  )
}
