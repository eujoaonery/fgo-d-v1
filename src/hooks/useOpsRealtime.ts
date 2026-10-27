import { useEffect, useRef } from 'react'
import { getApiAccessToken } from '@/lib/apiAccessToken'
import { apiUrl } from '@/lib/apiBase'
import { authUsesCookies } from '@/lib/authMode'

/** SSE §9 — ticket efêmero (60s) em vez de JWT na query string. */
export function useOpsRealtime(
  enabled: boolean,
  onDataChanged: () => void,
  onConnectionChange?: (connected: boolean) => void,
) {
  const onChangeRef = useRef(onDataChanged)
  onChangeRef.current = onDataChanged

  useEffect(() => {
    if (!enabled) {
      onConnectionChange?.(false)
      return
    }
    const token = getApiAccessToken()
    const cookieAuth = authUsesCookies()
    if (!cookieAuth && !token) {
      onConnectionChange?.(false)
      return
    }

    let es: EventSource | null = null
    let cancelled = false

    void (async () => {
      try {
        const headers: HeadersInit = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(apiUrl('/api/events/stream-ticket'), {
          method: 'POST',
          headers,
          credentials: cookieAuth ? 'include' : 'same-origin',
        })
        if (!res.ok || cancelled) {
          onConnectionChange?.(false)
          return
        }
        const { ticket } = (await res.json()) as { ticket?: string }
        if (!ticket || cancelled) {
          onConnectionChange?.(false)
          return
        }
        const url = `${apiUrl('/api/events/stream')}?ticket=${encodeURIComponent(ticket)}`
        es = new EventSource(url)

        es.addEventListener('open', () => onConnectionChange?.(true))
        es.addEventListener('heartbeat', (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as { dataChanged?: boolean }
            if (data.dataChanged) onChangeRef.current()
          } catch {
            /* ignore malformed */
          }
        })
        es.onerror = () => {
          onConnectionChange?.(false)
          es?.close()
        }
      } catch {
        onConnectionChange?.(false)
      }
    })()

    return () => {
      cancelled = true
      onConnectionChange?.(false)
      es?.close()
    }
  }, [enabled, onConnectionChange])
}
