import { timingSafeEqual } from 'node:crypto'

/** Comparação constant-time para segredos (chaves de ingestão, tickets). */
export function safeEqualString(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
