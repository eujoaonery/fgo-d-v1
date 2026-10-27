import { randomBytes } from 'node:crypto'

const TTL_MS = 60_000
const tickets = new Map<string, { bearer: string; exp: number }>()

export function issueSseTicket(bearerToken: string): string {
  const ticket = randomBytes(24).toString('hex')
  tickets.set(ticket, { bearer: bearerToken, exp: Date.now() + TTL_MS })
  return ticket
}

/** Consome ticket one-shot; retorna Bearer token ou null. */
export function consumeSseTicket(ticket: string | undefined): string | null {
  if (!ticket?.trim()) return null
  const key = ticket.trim()
  const row = tickets.get(key)
  tickets.delete(key)
  if (!row || row.exp < Date.now()) return null
  return row.bearer
}

/** Limpa tickets expirados (best-effort). */
export function purgeExpiredSseTickets(): void {
  const now = Date.now()
  for (const [k, v] of tickets) {
    if (v.exp < now) tickets.delete(k)
  }
}
