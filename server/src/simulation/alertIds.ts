const ALERT_PROTOCOL_BASE = 2800

export function alertProtocolFromCounter(counter: number): string {
  return `ALT-${ALERT_PROTOCOL_BASE + counter}`
}

/** Menor valor do contador que ainda gera um protocolo acima dos que já existem. */
export function counterFloorFromProtocols(protocols: readonly string[]): number {
  let max = 0
  for (const protocol of protocols) {
    const match = /^ALT-(\d+)$/.exec(protocol)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) max = value
  }
  return Math.max(0, max - ALERT_PROTOCOL_BASE)
}
