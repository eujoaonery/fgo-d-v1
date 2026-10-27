/** Intervalo entre ticks do motor de monitoramento (ms). */
export const TICK_INTERVAL_MS_MIN = 5_000
export const TICK_INTERVAL_MS_MAX = 3_600_000

export function clampTickIntervalMs(ms: number): number {
  if (!Number.isFinite(ms)) return 60_000
  return Math.min(TICK_INTERVAL_MS_MAX, Math.max(TICK_INTERVAL_MS_MIN, Math.round(ms)))
}
