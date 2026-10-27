import { useEffect, useState } from 'react'
import { LoadScreen } from '@/components/ui/LoadScreen'

const DEFAULT_TIMEOUT_MS = 1_200

/** Cobertura da aba até os dados principais chegarem — some no máximo em ~1,2s. */
export function TabLoadScreen({
  ready,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  children,
}: {
  ready: boolean
  timeoutMs?: number
  children: React.ReactNode
}) {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (ready) {
      setTimedOut(false)
      return
    }
    setTimedOut(false)
    const id = window.setTimeout(() => setTimedOut(true), timeoutMs)
    return () => window.clearTimeout(id)
  }, [ready, timeoutMs])

  if (!ready && !timedOut) {
    return <LoadScreen full={false} />
  }

  return <>{children}</>
}
