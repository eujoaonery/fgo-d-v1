export type GoTrueSession = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user: { id: string; email?: string }
}

function supabaseAuthBase(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios para auth BFF')
  }
  return { url, anonKey }
}

export async function goTruePasswordGrant(email: string, password: string): Promise<GoTrueSession> {
  const { url, anonKey } = supabaseAuthBase()
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json()) as GoTrueSession & { error_description?: string; msg?: string }
  if (!res.ok) {
    throw new Error(body.error_description ?? body.msg ?? 'Credenciais inválidas')
  }
  if (!body.access_token) throw new Error('Resposta de autenticação inválida')
  return body
}

export async function goTrueLogout(accessToken: string | undefined): Promise<void> {
  if (!accessToken?.trim()) return
  const { url, anonKey } = supabaseAuthBase()
  try {
    await fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    /* logout local já limpa cookies; falha remota não deve bloquear o cliente */
  }
}

export async function goTrueRefresh(refreshToken: string): Promise<GoTrueSession> {
  const { url, anonKey } = supabaseAuthBase()
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const body = (await res.json()) as GoTrueSession & { error_description?: string }
  if (!res.ok) throw new Error(body.error_description ?? 'Sessão expirada')
  return body
}
