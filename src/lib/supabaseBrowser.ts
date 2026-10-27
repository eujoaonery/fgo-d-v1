import { createClient } from '@supabase/supabase-js'
import { isClientBffAuth } from '@/lib/authMode'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Em produção (BFF) o browser não instancia Supabase — evita expor URL/chave do projeto. */
export const supabaseBrowser =
  !isClientBffAuth() && url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null
