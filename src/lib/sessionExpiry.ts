const HAD = 'fogo.hadSession'
/** Chave antiga da tela cheia de sessão expirada. Só é apagada. */
const LEGACY_EXPIRED = 'fogo.sessionExpired'

const listeners = new Set<() => void>()
let authEpoch = 0

export function currentAuthEpoch(): number {
  return authEpoch
}

function bumpAuthEpoch() {
  authEpoch += 1
}

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function markSessionEstablished() {
  bumpAuthEpoch()
  const s = storage()
  s?.setItem(HAD, '1')
  s?.removeItem(LEGACY_EXPIRED)
}

/** Encerra a sessão no cliente uma vez. Quem perdeu a sessão cai no login, sem tela intermediária. */
export function markSessionExpired() {
  const s = storage()
  s?.removeItem(LEGACY_EXPIRED)
  if (s?.getItem(HAD) !== '1') return
  s.removeItem(HAD)
  listeners.forEach((fn) => fn())
}

export function markSessionCleared() {
  const s = storage()
  s?.removeItem(HAD)
  s?.removeItem(LEGACY_EXPIRED)
}

export function onSessionExpired(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const AUTH_SKIP = /\/api\/auth\/(login|session|config|logout|events)\b/

export function noteUnauthorized(url?: string, startedEpoch?: number) {
  if (startedEpoch != null && startedEpoch !== authEpoch) return
  if (url && AUTH_SKIP.test(url)) return
  markSessionExpired()
}
