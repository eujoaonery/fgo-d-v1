import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { HttpError } from '../httpError.js'

function keyMaterial(): Buffer {
  const dedicated = process.env.FOGO_CONNECTOR_SECRET_KEY?.trim()
  if (dedicated && dedicated.length >= 16) {
    return scryptSync(dedicated, 'fogo-connector-secrets-v1', 32)
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fallback && fallback.length >= 16) {
    return scryptSync(fallback, 'fogo-connector-secrets-v1-svc', 32)
  }
  throw new HttpError(
    503,
    'Defina FOGO_CONNECTOR_SECRET_KEY (mínimo 16 caracteres) para armazenar credenciais de conectores.',
    'SECRETS_KEY_MISSING',
  )
}

export function secretsConfigured(): boolean {
  const dedicated = process.env.FOGO_CONNECTOR_SECRET_KEY?.trim()
  if ((dedicated?.length ?? 0) >= 16) return true
  return (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim().length ?? 0) >= 16
}

export function encryptSecret(plain: Record<string, string>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(blob: string): Record<string, string> {
  const [ver, ivB64, tagB64, dataB64] = blob.split(':')
  if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Segredo corrompido')
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return JSON.parse(out.toString('utf8')) as Record<string, string>
}
