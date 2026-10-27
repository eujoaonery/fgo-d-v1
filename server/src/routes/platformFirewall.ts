import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import { canonicalIp, normalizeCidr, normalizeCidrList } from '../platform/cidr.js'
import { applyFirewallNginx, wouldLockOut, type FirewallRules } from '../platform/firewallApply.js'
import type { AuthedRequest } from '../middleware/platformAdmin.js'

function asStringList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function rowToRules(row: {
  site_allow?: unknown
  site_deny?: unknown
  mng_allow?: unknown
}): FirewallRules {
  return {
    siteAllow: normalizeCidrList(row.site_allow),
    siteDeny: normalizeCidrList(row.site_deny),
    mngAllow: normalizeCidrList(row.mng_allow),
  }
}

function clientIp(req: { ip?: string; headers: { [k: string]: unknown } }): string | null {
  const xf = req.headers['x-forwarded-for']
  const raw = typeof xf === 'string' && xf.trim() ? xf.split(',')[0]?.trim() ?? null : (req.ip ?? null)
  return canonicalIp(raw)
}

export function createPlatformFirewallRouter(db: FogoDb, requirePlatformAdmin: RequestHandler) {
  const router = Router()
  router.use(requirePlatformAdmin)

  router.get('/firewall', async (req: AuthedRequest, res, next) => {
    try {
      const { data, error } = await db.supabase.from('platform_firewall').select('*').eq('id', 1).maybeSingle()
      if (error) throw error
      const rules = rowToRules(data ?? {})
      const ip = clientIp(req)
      res.json({
        clientIp: ip,
        siteAllow: rules.siteAllow,
        siteDeny: rules.siteDeny,
        mngAllow: rules.mngAllow,
        cityLogin: (data?.city_login as Record<string, string[]>) ?? {},
        updatedAt: data?.updated_at ?? null,
        nginxHost: process.platform === 'linux',
      })
    } catch (e) {
      next(e)
    }
  })

  router.put('/firewall', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body as {
        siteAllow?: unknown
        siteDeny?: unknown
        mngAllow?: unknown
        includeMyIp?: boolean
      }
      const ip = clientIp(req)
      let siteAllow = normalizeCidrList(asStringList(body.siteAllow))
      const siteDeny = normalizeCidrList(asStringList(body.siteDeny))
      let mngAllow = normalizeCidrList(asStringList(body.mngAllow))

      if (body.includeMyIp && ip) {
        const self = normalizeCidr(ip)
        if (self) {
          if (siteAllow.length > 0 && !siteAllow.includes(self)) siteAllow = [...siteAllow, self]
          if (mngAllow.length > 0 && !mngAllow.includes(self)) mngAllow = [...mngAllow, self]
        }
      }

      const rules: FirewallRules = { siteAllow, siteDeny, mngAllow }
      const lock = wouldLockOut(ip, rules)
      if (lock) throw new HttpError(400, lock, 'FIREWALL_LOCKOUT')

      const { data, error } = await db.supabase
        .from('platform_firewall')
        .upsert({
          id: 1,
          site_allow: siteAllow,
          site_deny: siteDeny,
          mng_allow: mngAllow,
          updated_at: new Date().toISOString(),
          updated_by: req.authUser?.id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error

      const apply = await applyFirewallNginx(rules)
      res.json({
        clientIp: ip,
        siteAllow,
        siteDeny,
        mngAllow,
        updatedAt: data.updated_at,
        applied: apply.applied,
        detail: apply.detail,
        nginxHost: process.platform === 'linux',
      })
    } catch (e) {
      next(e)
    }
  })

  return router
}
