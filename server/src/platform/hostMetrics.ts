import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type HostSample = {
  at: string
  cpuPercent: number
  memUsedBytes: number
  memTotalBytes: number
  memPercent: number
  diskUsedBytes: number
  diskTotalBytes: number
  diskPercent: number
  load1: number
  uptimeSec: number
}

const LIVE_MS = 4_000
const LIVE_MAX = 225
const MINUTE_MS = 60_000
const MINUTE_KEEP_MS = 24 * 3600_000
const HOUR_KEEP_MS = 7 * 24 * 3600_000

let prevCpu = cpuSnapshot()
const live: HostSample[] = []
let minute: HostSample[] = []
let hourly: HostSample[] = []
let timer: ReturnType<typeof setInterval> | null = null
let lastMinuteAt = 0
let lastHourKey = ''

function dataDir() {
  return process.env.FOGO_DATA_DIR || path.join(process.cwd(), 'data')
}

function minuteFile() {
  return path.join(dataDir(), 'host-metrics-minute.jsonl')
}

function hourlyFile() {
  return path.join(dataDir(), 'host-metrics-hourly.jsonl')
}

function cpuSnapshot() {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const t = cpu.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

function cpuPercent(): number {
  const cur = cpuSnapshot()
  const idle = cur.idle - prevCpu.idle
  const total = cur.total - prevCpu.total
  prevCpu = cur
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, (1 - idle / total) * 100))
}

function memUsage(): { total: number; used: number } {
  try {
    const text = readFileSync('/proc/meminfo', 'utf8')
    const kb = (key: string) => {
      const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
      return m ? Number(m[1]) * 1024 : null
    }
    const total = kb('MemTotal')
    const avail = kb('MemAvailable')
    if (total && avail != null) return { total, used: Math.max(0, total - avail) }
  } catch {
    /* Windows / sem proc */
  }
  const total = os.totalmem()
  return { total, used: Math.max(0, total - os.freemem()) }
}

function diskUsage(): { total: number; used: number } {
  try {
    const root = process.platform === 'win32' ? process.cwd().slice(0, 3) || 'C:\\' : '/'
    const s = statfsSync(root)
    const bsize = Number(s.bsize)
    const total = Number(s.blocks) * bsize
    const free = Number(s.bavail) * bsize
    return { total, used: Math.max(0, total - free) }
  } catch {
    return { total: 0, used: 0 }
  }
}

function takeSample(): HostSample {
  const mem = memUsage()
  const disk = diskUsage()
  const cpu = cpuPercent()
  return {
    at: new Date().toISOString(),
    cpuPercent: round1(cpu),
    memUsedBytes: mem.used,
    memTotalBytes: mem.total,
    memPercent: pct(mem.used, mem.total),
    diskUsedBytes: disk.used,
    diskTotalBytes: disk.total,
    diskPercent: pct(disk.used, disk.total),
    load1: os.loadavg()[0] ?? 0,
    uptimeSec: os.uptime(),
  }
}

function pct(used: number, total: number) {
  if (!total) return 0
  return round1((used / total) * 100)
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function parseLine(line: string): HostSample | null {
  try {
    const row = JSON.parse(line) as HostSample
    if (!row?.at || typeof row.cpuPercent !== 'number') return null
    return row
  } catch {
    return null
  }
}

function loadJsonl(file: string, keepMs: number): HostSample[] {
  try {
    const cutoff = Date.now() - keepMs
    return readFileSync(file, 'utf8')
      .split('\n')
      .map(parseLine)
      .filter((row): row is HostSample => !!row && Date.parse(row.at) >= cutoff)
  } catch {
    return []
  }
}

function persistJsonl(file: string, rows: HostSample[]) {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
  } catch (err) {
    console.error('[fogo] host metrics persist', err instanceof Error ? err.message : err)
  }
}

function prune(rows: HostSample[], keepMs: number) {
  const cutoff = Date.now() - keepMs
  return rows.filter((r) => Date.parse(r.at) >= cutoff)
}

function pushSample() {
  const sample = takeSample()
  live.push(sample)
  if (live.length > LIVE_MAX) live.shift()

  const now = Date.parse(sample.at)
  if (!lastMinuteAt || now - lastMinuteAt >= MINUTE_MS) {
    lastMinuteAt = now
    minute.push(sample)
    minute = prune(minute, MINUTE_KEEP_MS)
    persistJsonl(minuteFile(), minute)
  }

  const hourKey = sample.at.slice(0, 13)
  if (hourKey !== lastHourKey) {
    lastHourKey = hourKey
    hourly.push(sample)
    hourly = prune(hourly, HOUR_KEEP_MS)
    persistJsonl(hourlyFile(), hourly)
  }
}

export function startHostMetricsSampler() {
  if (timer) return
  minute = loadJsonl(minuteFile(), MINUTE_KEEP_MS)
  hourly = loadJsonl(hourlyFile(), HOUR_KEEP_MS)
  if (minute.length) lastMinuteAt = Date.parse(minute[minute.length - 1]!.at)
  if (hourly.length) lastHourKey = hourly[hourly.length - 1]!.at.slice(0, 13)
  prevCpu = cpuSnapshot()
  setTimeout(() => {
    pushSample()
    timer = setInterval(pushSample, LIVE_MS)
    timer.unref?.()
  }, 1_200)
}

function readOsRelease(): { pretty: string; family: string } {
  try {
    const text = readFileSync('/etc/os-release', 'utf8')
    const field = (key: string) => {
      const m = text.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))
      return m?.[1]?.trim() ?? ''
    }
    const id = field('ID').toLowerCase()
    const version = field('VERSION_ID')
    const prettyName = field('PRETTY_NAME')
    if (id === 'debian' && version) return { pretty: `Debian ${version}`, family: prettyName || `Debian ${version}` }
    if (prettyName) return { pretty: prettyName.replace(/\s+\(.*\)$/, ''), family: prettyName }
  } catch {
    /* Windows / sem os-release */
  }
  return { pretty: '', family: '' }
}

export function hostIdentity() {
  const mem = memUsage()
  const disk = diskUsage()
  const cpus = os.cpus()
  const osInfo = readOsRelease()
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model?.replace(/\s+/g, ' ').trim() || 'CPU',
    memTotalBytes: mem.total,
    diskTotalBytes: disk.total,
    node: process.version,
    pid: process.pid,
    osPretty: osInfo.pretty,
    osFamily: osInfo.family,
  }
}

export function readHostMetrics() {
  const current = live[live.length - 1] ?? takeSample()
  return {
    current,
    series: [...live],
    historyHour: prune(minute, 3600_000),
    historyDay: prune(minute, MINUTE_KEEP_MS),
    historyWeek: prune(hourly, HOUR_KEEP_MS),
  }
}
