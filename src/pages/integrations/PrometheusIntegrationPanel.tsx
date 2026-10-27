import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OpsPanel } from '@/components/ui/OpsPanel'
import {
  fetchPrometheusIntegration,
  savePrometheusIntegration,
  testPrometheusIntegration,
  type PrometheusIntegrationStatus,
} from '@/lib/api'
import { ROUTES } from '@/lib/routes'
import { useCityHref } from '@/context/TenantContext'

const inputClass =
  'mt-1 w-full rounded-md border border-fogo-border bg-fogo-surface px-2 py-1.5 text-sm text-fogo-text'

export function PrometheusIntegrationPanel({ canEdit }: { canEdit: boolean }) {
  const href = useCityHref()
  const [status, setStatus] = useState<PrometheusIntegrationStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const next = await fetchPrometheusIntegration()
      setStatus(next)
      setModel(next.openai.model || 'gpt-4o-mini')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o PROMETHEUS.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onSave() {
    if (!canEdit) return
    setBusy('save')
    setError(null)
    setMessage(null)
    try {
      const channelPatch: Record<string, string | null> = {}
      for (const ch of status?.channels ?? []) {
        if (ch.id in channels) channelPatch[ch.id] = channels[ch.id] ?? ''
      }
      const next = await savePrometheusIntegration({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: model.trim() || 'gpt-4o-mini',
        ...(Object.keys(channelPatch).length ? { channels: channelPatch } : {}),
      })
      setStatus(next)
      setApiKey('')
      setChannels({})
      setMessage('PROMETHEUS salvo. A chave não volta a ser exibida.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setBusy(null)
    }
  }

  async function onTest() {
    if (!canEdit) return
    setBusy('test')
    setError(null)
    setMessage(null)
    try {
      const result = await testPrometheusIntegration({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model,
      })
      if (result.ok) setMessage(`OpenAI respondeu. Modelo em uso: ${result.model}.`)
      else setError(result.error || 'Teste recusado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no teste.')
    } finally {
      setBusy(null)
    }
  }

  async function onClearKey() {
    if (!canEdit) return
    if (!window.confirm('Remover a chave OpenAI desta cidade? O PROMETHEUS para de gerar análises novas.')) return
    setBusy('clear')
    setError(null)
    setMessage(null)
    try {
      const next = await savePrometheusIntegration({ clearKey: true })
      setStatus(next)
      setApiKey('')
      setMessage('Chave da cidade removida.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a chave.')
    } finally {
      setBusy(null)
    }
  }

  const openai = status?.openai

  return (
    <OpsPanel
      title="PROMETHEUS · OpenAI"
      subtitle="Análise estratégica do CCO. A chave fica no cofre da cidade e nunca reaparece completa."
      action={
        <Link to={href(ROUTES.strategy)} className="text-xs text-fogo-accent hover:underline">
          Painel estratégico
        </Link>
      }
    >
      <div className="space-y-4 p-4">
        {error ? <p className="text-sm text-fogo-critical">{error}</p> : null}
        {message ? <p className="text-sm text-fogo-success">{message}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={openai?.configured ? 'success' : 'warning'}>
            {openai?.configured ? 'OpenAI ligada' : 'OpenAI desligada'}
          </Badge>
          {openai?.fromOrg ? <Badge variant="neutral">chave desta cidade</Badge> : null}
          {openai?.fromEnv ? <Badge variant="neutral">chave do servidor</Badge> : null}
          {openai?.keyHint ? <span className="font-mono text-xs text-fogo-muted">{openai.keyHint}</span> : null}
          {status && !status.vaultReady ? (
            <p className="text-xs text-fogo-warning">Cofre indisponível neste servidor — avise o administrador da plataforma.</p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-fogo-muted">
            Chave da API OpenAI
            <input
              type="password"
              autoComplete="off"
              className={inputClass}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={openai?.configured ? '•••• nova chave (opcional)' : 'sk-…'}
              disabled={!canEdit}
            />
          </label>
          <label className="text-xs text-fogo-muted">
            Modelo
            <input
              className={inputClass}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              disabled={!canEdit}
            />
          </label>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={busy !== null} onClick={() => void onSave()}>
              {busy === 'save' ? 'Salvando…' : 'Salvar chave'}
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void onTest()}>
              {busy === 'test' ? 'Testando…' : 'Testar conexão'}
            </Button>
            {openai?.fromOrg ? (
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void onClearKey()}>
                {busy === 'clear' ? 'Removendo…' : 'Remover chave'}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-fogo-muted">Somente administradores e gestores gravam a chave.</p>
        )}

        <div>
          <p className="text-sm font-medium text-fogo-text">Canais das ações estratégicas</p>
          <p className="mt-0.5 text-xs text-fogo-muted">
            Opcionais. Sem URL, a ação fica registrada e não é enviada como se tivesse ocorrido.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(status?.channels ?? []).map((ch) => (
              <label key={ch.id} className="text-xs text-fogo-muted">
                <span className="flex items-center gap-2">
                  {ch.label}
                  <Badge variant={ch.configured ? 'success' : 'neutral'}>
                    {ch.configured ? (ch.fromOrg ? 'cidade' : 'servidor') : 'não'}
                  </Badge>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  className={inputClass}
                  value={channels[ch.id] ?? ''}
                  onChange={(e) => setChannels((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                  placeholder={ch.configured ? '•••• nova URL (opcional)' : 'https://…'}
                  disabled={!canEdit}
                />
                <span className="mt-0.5 block text-[11px]">{ch.hint}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </OpsPanel>
  )
}
