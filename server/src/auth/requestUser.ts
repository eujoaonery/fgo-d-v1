import type { Request } from 'express'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { readAccessTokenFromRequest } from './sessionCookies.js'
import { AuthError } from '../orgContext.js'

export function readBearerFromRequest(req: Request): string | undefined {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7)
  return readAccessTokenFromRequest(req.headers.cookie)
}

export async function getRequestUser(supabase: SupabaseClient, req: Request): Promise<User> {
  const token = readBearerFromRequest(req)
  if (!token) throw new AuthError('Autenticação necessária')
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AuthError('Sessão inválida ou expirada')
  return data.user
}

export async function isPlatformAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return !!data && data.status !== 'inactive'
}
