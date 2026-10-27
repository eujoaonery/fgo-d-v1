import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { LoadScreen } from '@/components/ui/LoadScreen'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { formatDateTimePtBr } from '@/lib/format'
import { fetchPlatformSessionPolicy, savePlatformSessionPolicy } from '@/lib/tenantApi'

const PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 120, label: '2 horas' },
  { minutes: 240, label: '4 horas' },
  { minutes: 480, label: '8 horas' },
  { minutes: 720, label: '12 horas' },
  { minutes: 1440, label: '24 horas' },
] as const

function spokenTtl(minutes: number) {
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? '' : 's'}`
  const hours = minutes / 60
  if (Number.isInteger(hours)) return `${hours} hora${hours === 1 ? '' : 's'}`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

export function PlatformSessionPage() {
  const [ttl, setTtl] = useState(60)
  const [custom, setCustom] = useState('60')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPlatformSessionPolicy()
      .then((policy) => {
        if (cancelled) return
        setTtl(policy.ttlMinutes)
        setCustom(String(policy.ttlMinutes))
        setUpdatedAt(policy.updatedAt)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar a política de sessão')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function choose(minutes: number) {
    setTtl(minutes)
    setCustom(String(minutes))
    setNotice(null)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const parsed = Number(custom)
    if (!Number.isFinite(parsed)) {
      setError('Informe o tempo em minutos.')
      return
    }
    setSaving(true)
    try {
      const saved = await savePlatformSessionPolicy(parsed)
      setTtl(saved.ttlMinutes)
      setCustom(String(saved.ttlMinutes))
      setUpdatedAt(saved.updatedAt)
      setNotice(`Sessões passam a expirar em ${spokenTtl(saved.ttlMinutes)} a partir do próximo login.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !error) return <LoadScreen full={false} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fogo-text">Sessões</h1>
        <p className="text-sm text-fogo-muted">
          Define quanto tempo o login do MNG e das cidades permanece válido. Vale no próximo acesso.
        </p>
      </div>

      {error ? (
        <p className="rounded-fogo-md border border-fogo-critical/35 bg-fogo-critical-bg px-3 py-2 text-sm text-fogo-critical">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-fogo-md border border-fogo-success/30 bg-fogo-success/10 px-3 py-2 text-sm text-fogo-text">
          {notice}
        </p>
      ) : null}

      <OpsPanel
        title="Tempo de expiração"
        subtitle={loading ? 'Carregando…' : `Atual: ${spokenTtl(ttl)}${updatedAt ? ` · alterado ${formatDateTimePtBr(updatedAt)}` : ''}`}
      >
        <form className="space-y-4 p-4" onSubmit={(e) => void onSave(e)}>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                disabled={loading}
                onClick={() => choose(p.minutes)}
                className={
                  ttl === p.minutes
                    ? 'rounded-fogo-sm bg-fogo-accent px-2.5 py-1 text-[12px] text-white'
                    : 'rounded-fogo-sm border border-fogo-border px-2.5 py-1 text-[12px] text-fogo-muted hover:text-fogo-text'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="block text-sm text-fogo-text">
            Minutos
            <input
              type="number"
              min={5}
              max={10080}
              className="mt-1 h-10 w-full max-w-xs rounded-fogo-md border border-fogo-border bg-fogo-surface px-3 text-sm text-fogo-text"
              value={custom}
              disabled={loading}
              onChange={(e) => {
                setCustom(e.target.value)
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setTtl(n)
              }}
            />
            <span className="mt-1 block text-[11px] text-fogo-muted">Mínimo 5 minutos. Máximo 7 dias (10080 min).</span>
          </label>
          <Button type="submit" variant="primary" disabled={saving || loading}>
            {saving ? 'Salvando…' : 'Salvar tempo de sessão'}
          </Button>
        </form>
      </OpsPanel>
    </div>
  )
}
