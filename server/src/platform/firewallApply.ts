import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { ipAllowed } from './cidr.js'

const execFileAsync = promisify(execFile)

export type FirewallRules = {
  siteAllow: string[]
  siteDeny: string[]
  mngAllow: string[]
}

const GEO_LOCAL = '/opt/fogo/nginx/fogo-firewall-geo.conf'
const SERVER_LOCAL = '/opt/fogo/nginx/fogo-firewall-server.conf'
const GEO_NGINX = '/etc/nginx/conf.d/fogo-firewall-geo.conf'
const SITE_FILE = '/etc/nginx/sites-available/fogo'
const INCLUDE_LINE = '    include /opt/fogo/nginx/fogo-firewall-server.conf;'

function geoBlock(varName: string, allow: string[], deny: string[]): string {
  const lines = [`geo $remote_addr $${varName} {`]
  const allowOn = allow.length > 0
  lines.push(`    default ${allowOn ? '0' : '1'};`)
  lines.push('    127.0.0.1 1;')
  lines.push('    ::1 1;')
  for (const c of deny) lines.push(`    ${c} 0;`)
  for (const c of allow) lines.push(`    ${c} 1;`)
  lines.push('}')
  return lines.join('\n')
}

export function renderGeoConf(rules: FirewallRules): string {
  return [
    '# Gerado pelo FOGO. Não edite à mão.',
    geoBlock('fogo_site_ok', rules.siteAllow, rules.siteDeny),
    '',
    geoBlock('fogo_mng_ok', rules.mngAllow, []),
    '',
  ].join('\n')
}

export function renderServerConf(): string {
  return `# Gerado pelo FOGO. Não edite à mão.
if ($fogo_site_ok = 0) {
    return 403;
}

location /mng {
    if ($fogo_mng_ok = 0) {
        return 403;
    }
    try_files $uri $uri/ /index.html;
}

location /api/mng {
    if ($fogo_mng_ok = 0) {
        return 403;
    }
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 20m;
}
`
}

export function wouldLockOut(ip: string | null, rules: FirewallRules): string | null {
  if (!ip) return 'Não foi possível identificar o seu IP. Recarregue a página e tente de novo.'
  if (!ipAllowed(ip, rules.siteAllow, rules.siteDeny)) {
    return `Esta regra bloquearia o IP atual (${ip}) na abertura do sistema.`
  }
  if (rules.mngAllow.length > 0 && !ipAllowed(ip, rules.mngAllow, [])) {
    return `Esta regra bloquearia o IP atual (${ip}) na rota /mng.`
  }
  return null
}

function nginxHost(): boolean {
  return process.platform === 'linux'
}

function sudoWrite(path: string, contents: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-n', 'tee', path], { stdio: ['pipe', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `falha ao gravar ${path}`))
    })
    child.stdin.write(contents)
    child.stdin.end()
  })
}

async function ensureSiteInclude() {
  const { stdout } = await execFileAsync('sudo', ['-n', 'cat', SITE_FILE], { timeout: 10_000 })
  if (stdout.includes(INCLUDE_LINE.trim())) return
  if (!stdout.includes('index index.html;')) {
    throw new Error('Arquivo do Nginx da aplicação não tem o formato esperado.')
  }
  const next = stdout.replace('index index.html;', `index index.html;\n${INCLUDE_LINE}`)
  await sudoWrite(SITE_FILE, next)
}

export async function applyFirewallNginx(rules: FirewallRules): Promise<{ applied: boolean; detail: string }> {
  if (!nginxHost()) {
    return { applied: false, detail: 'Salvo. Recarga do Nginx só roda no servidor Linux de produção.' }
  }
  await mkdir('/opt/fogo/nginx', { recursive: true })
  await writeFile(GEO_LOCAL, renderGeoConf(rules), 'utf8')
  await writeFile(SERVER_LOCAL, renderServerConf(), 'utf8')
  await execFileAsync('sudo', ['-n', 'cp', GEO_LOCAL, GEO_NGINX], { timeout: 10_000 })
  await ensureSiteInclude()
  try {
    await execFileAsync('sudo', ['-n', 'nginx', '-t'], { timeout: 15_000 })
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    throw new Error(`Nginx recusou a configuração: ${(err.stderr || err.message || '').trim()}`)
  }
  await execFileAsync('sudo', ['-n', 'systemctl', 'reload', 'nginx'], { timeout: 15_000 })
  return {
    applied: true,
    detail: 'Nginx recarregado. IPs fora da regra recebem 403 do servidor, sem abrir o FOGO.',
  }
}

export async function readAppliedGeo(): Promise<string | null> {
  try {
    return await readFile(GEO_LOCAL, 'utf8')
  } catch {
    return null
  }
}
