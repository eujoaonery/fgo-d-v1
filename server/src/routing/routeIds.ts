export function formatRouteExternalId(n: number): string {
  return `RT-${Math.max(0, Math.floor(n)).toString().padStart(4, '0')}`
}

export function maxRouteSerial(ids: string[]): number {
  let max = 0
  for (const id of ids) {
    const match = /^RT-(\d+)$/.exec(id.trim())
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}
