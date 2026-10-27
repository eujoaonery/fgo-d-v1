export function PrometheusModeToggle({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className="fogo-prometheus-toggle"
      data-on={on ? 'true' : 'false'}
      aria-pressed={on}
      onClick={() => onToggle(!on)}
    >
      <span className="fogo-prometheus-track" aria-hidden>
        <span className="fogo-prometheus-knob" />
      </span>
      <span className="text-left leading-tight">
        <span className="block text-[11px] font-semibold text-fogo-text">Modo Prometheus</span>
        <span className="block text-[10px] text-fogo-muted">{on ? 'Abas técnicas visíveis' : 'Quadro simples de previsões'}</span>
      </span>
    </button>
  )
}
