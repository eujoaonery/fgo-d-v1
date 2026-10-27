import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact' | 'flexible'
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile indisponível'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Props = {
  siteKey: string
  onToken: (token: string | null) => void
  className?: string
  size?: 'normal' | 'compact' | 'flexible'
}

export function TurnstileField({ siteKey, onToken, className, size = 'flexible' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          size,
          callback: (t) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null)
            setFailed(true)
          },
        })
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [siteKey, onToken, size])

  if (failed) {
    return <p className="text-xs text-fogo-danger">Verificação de segurança indisponível. Tente recarregar.</p>
  }

  return <div ref={ref} className={className} aria-label="Verificação Cloudflare Turnstile" />
}
