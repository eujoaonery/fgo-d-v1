import '../src/loadEnv.js'
import { createClient } from '@supabase/supabase-js'
import { ensurePlatformSuperAdmin } from '../src/platform/seedSuperAdmin.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.FOGO_SUPERADMIN_EMAIL
const password = process.env.FOGO_SUPERADMIN_PASSWORD

if (!url || !key || !email || !password) {
  console.error('Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOGO_SUPERADMIN_EMAIL, FOGO_SUPERADMIN_PASSWORD')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

ensurePlatformSuperAdmin(supabase, email, password)
  .then((id) => {
    console.log('Super admin pronto. user_id:', id)
    console.log('Use a API /api/mng ou provisione operadores via administrador.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
