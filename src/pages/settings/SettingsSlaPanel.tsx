import { useEffect, useState } from 'react'
import { OpsPanel } from '@/components/ui/OpsPanel'
import { Button } from '@/components/ui/Button'
import { fetchCategorySla, saveCategorySla, type CategorySlaConfig } from '@/lib/api'

export function SettingsSlaPanel({ enabled }: { enabled: boolean }) {
  const [config, setConfig] = useState<CategorySlaConfig | null>(null)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    void fetchCategorySla()
      .then((next) => {
        setConfig(next)
        setDraft(Object.fromEntries(next.categories.map((c) => [c.category, c.minutes])))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar SLA'))
      .finally(() => setLoading(false))
  }, [enabled])

  if (!enabled) return null

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = await saveCategorySla(draft)
      setConfig(next)
      setDraft(Object.fromEntries(next.categories.map((c) => [c.category, c.minutes])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o SLA.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <OpsPanel
      title="SLA por categoria"
      subtitle="Janela da abertura do alerta até a conclusão da OS (ou resolução sem OS). 100% até o último minuto; depois cai e pode ficar negativo."
      action={
        <Button size="sm" variant="primary" disabled={saving || loading} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar SLA'}
        </Button>
      }
    >
      <div className="space-y-3 p-4">
        {error ? (
          <p className="rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-3 py-2 text-xs text-fogo-text">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-fogo-muted">
          Padrão: {config?.defaultMinutes ?? 60} minutos. Visível só para administradores e gestores.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(config?.categories ?? []).map((row) => (
            <label key={row.category} className="flex items-center justify-between gap-3 rounded-fogo-md border border-fogo-border px-3 py-2">
              <span className="text-sm text-fogo-text">{row.category}</span>
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  className="w-20 rounded-fogo-md border border-fogo-border bg-fogo-bg px-2 py-1 text-right text-sm tabular-nums"
                  value={draft[row.category] ?? row.minutes}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [row.category]: Number(e.target.value) || row.minutes }))
                  }
                />
                <span className="text-[11px] text-fogo-muted">min</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </OpsPanel>
  )
}
