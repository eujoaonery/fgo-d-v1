import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { confirmAdminReauth } from '@/lib/api'

export function SettingsResetHistoryDialog({
  open,
  onClose,
  onReset,
}: {
  open: boolean
  onClose: () => void
  onReset: () => Promise<void>
}) {
  const [step, setStep] = useState<'confirm' | 'password'>('confirm')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = password.trim().length > 0

  useEffect(() => {
    if (!open) return
    setStep('confirm')
    setPassword('')
    setBusy(false)
    setError(null)
  }, [open])

  async function wipe() {
    if (!typed || busy) return
    setBusy(true)
    setError(null)
    try {
      await confirmAdminReauth(password)
      await onReset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar a senha.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={step === 'confirm' ? 'Apagar histórico' : 'Confirme sua senha'}>
      {step === 'confirm' ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-fogo-text">
            Isso retira os parâmetros e o histórico utilizados pelas análises e pelo Prevision Engine. Alertas,
            ocorrências e o histórico de atividade da cidade deixam de existir para essas leituras. Os cadastros da
            cidade permanecem.
          </p>
          <p className="text-sm font-medium text-fogo-text">Tem certeza?</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Não
            </Button>
            <Button type="button" variant="primary" onClick={() => setStep('password')}>
              Sim
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-fogo-muted">
            Digite a senha da sua conta. O histórico só é apagado se você confirmar a senha e, em seguida, escolher
            limpar.
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-fogo-text">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-9 w-full rounded-fogo-md border border-fogo-border bg-fogo-bg px-3 text-sm text-fogo-text outline-none focus:border-fogo-accent"
            />
          </label>
          {error ? (
            <p className="rounded-fogo-md border border-fogo-warning/50 bg-fogo-warning/10 px-3 py-2 text-xs text-fogo-text">
              {error}
            </p>
          ) : null}
          {typed ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-fogo-warning text-fogo-warning"
              disabled={busy}
              onClick={() => void wipe()}
            >
              {busy ? 'Limpando…' : 'Quero limpar todo o histórico de ocorrências da cidade'}
            </Button>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Não
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
