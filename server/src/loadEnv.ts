import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

/** Garante `.env` na raiz do repo (cwd pode variar no Windows/concurrently). */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
dotenv.config({ path: path.join(repoRoot, '.env') })
