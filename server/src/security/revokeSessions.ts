/** Revoga sessões GoTrue do usuário quando o acesso deixa de ser autorizado (§5.7). */
export async function revokeUserSessions(userId: string): Promise<void> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !userId) return
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok && res.status !== 404) {
      console.warn('[fogo] falha ao revogar sessões', userId, res.status)
    }
  } catch (e) {
    console.warn('[fogo] falha ao revogar sessões', userId, e instanceof Error ? e.message : e)
  }
}
