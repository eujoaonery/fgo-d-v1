import cors from 'cors'

function parseOrigins(raw: string | undefined): string[] | null {
  if (!raw?.trim()) return null
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Aceita localhost e 127.0.0.1 como o mesmo host (preview local na 4173). */
function expandLoopback(origins: string[]): string[] {
  const out = new Set(origins)
  for (const origin of origins) {
    try {
      const url = new URL(origin)
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1'
        out.add(url.origin)
      } else if (url.hostname === '127.0.0.1') {
        url.hostname = 'localhost'
        out.add(url.origin)
      }
    } catch {
      /* origem malformada permanece só como veio */
    }
  }
  return [...out]
}

/** Same-origin (sem Origin) e origens da lista são aceitos; valores desconhecidos são recusados. */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true
  return allowed.includes(origin)
}

export function createCorsMiddleware() {
  const allowlist = parseOrigins(process.env.FOGO_CORS_ORIGINS)
  const isProd = process.env.NODE_ENV === 'production'

  if (allowlist?.length) {
    const allowed = expandLoopback(allowlist)
    return cors({
      origin(origin, cb) {
        // Não lançar Error: o handler Express responde 500 e vaza o fluxo.
        cb(null, isOriginAllowed(origin, allowed))
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Fogo-Tenant', 'X-Fogo-Step-Up'],
    })
  }

  if (isProd) {
    return cors({ origin: false })
  }

  return cors({
    origin: expandLoopback([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://localhost:4174',
    ]),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Fogo-Tenant', 'X-Fogo-Step-Up'],
  })
}
