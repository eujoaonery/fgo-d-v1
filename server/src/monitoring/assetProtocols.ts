import { isSafeHostname } from '../connectors/timeout.js'
import { createConnector, listConnectors, loadSecrets, updateConnector } from '../connectors/store.js'
import type { FogoDb } from '../db.js'
import { HttpError } from '../httpError.js'
import type { ConnectorKind, ConnectorRecord } from '../connectors/types.js'
import type { UrbanAsset } from '../types.js'

export type AssetProtocolBody = {
  mqttEnabled?: boolean
  mqttHost?: string
  mqttPort?: number | string
  mqttTls?: boolean
  mqttTopics?: string
  mqttClientId?: string
  mqttUsername?: string
  mqttPassword?: string
  snmpEnabled?: boolean
  snmpHost?: string
  snmpPort?: number | string
  snmpVersion?: string
  snmpOids?: string
  snmpCommunity?: string
  snmpUsername?: string
  snmpAuthProtocol?: string
  snmpPrivProtocol?: string
  snmpAuthPassword?: string
  snmpPrivPassword?: string
  rtspEnabled?: boolean
  rtspHost?: string
  rtspPort?: number | string
  rtspPath?: string
  rtspUsername?: string
  rtspPassword?: string
  onvifEnabled?: boolean
  onvifHost?: string
  onvifPort?: number | string
  onvifPath?: string
  onvifTls?: boolean
  onvifUsername?: string
  onvifPassword?: string
}

const OID = /^\.?\d+(?:\.\d+)+$/

export function splitList(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parsePort(raw: number | string | undefined, fallback: number): number {
  if (raw == null || String(raw).trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new HttpError(400, 'Informe uma porta entre 1 e 65535.')
  }
  return n
}

export function slashPath(raw: string | undefined, fallback: string): string {
  const text = String(raw ?? '').trim() || fallback
  return text.startsWith('/') ? text : `/${text}`
}

function requireHost(label: string, host: string) {
  if (!isSafeHostname(host)) {
    throw new HttpError(400, `${label} inválido. Use um IP ou um nome de máquina, sem barra nem espaço.`)
  }
}

function bound(connectors: ConnectorRecord[], kind: ConnectorKind, assetId: string) {
  return connectors.find((row) => row.kind === kind && String(row.config.assetExternalId ?? '') === assetId)
}

async function mergedSecrets(
  db: FogoDb,
  current: ConnectorRecord | undefined,
  incoming: Record<string, string | undefined>,
): Promise<Record<string, string> | undefined> {
  const provided: Record<string, string> = {}
  for (const [key, value] of Object.entries(incoming)) {
    const text = value?.trim()
    if (text) provided[key] = text
  }
  if (!Object.keys(provided).length) return undefined
  const prev = current?.secretId ? await loadSecrets(db.supabase, db.orgId, current.secretId) : {}
  return { ...prev, ...provided }
}

async function upsertBound(
  db: FogoDb,
  asset: { id: string; name: string },
  kind: ConnectorKind,
  enabled: boolean,
  config: Record<string, unknown>,
  secrets: Record<string, string> | undefined,
) {
  const connectors = await listConnectors(db.supabase, db.orgId)
  const current = bound(connectors, kind, asset.id)
  const name = `${kind.toUpperCase()} ${asset.name}`.slice(0, 120)
  if (!current) {
    if (!enabled) return
    await createConnector(db.supabase, db.orgId, {
      kind,
      name,
      description: `Configurado no cadastro do ativo ${asset.id}.`,
      config,
      enabled,
      secrets,
      createdBy: db.actor?.userId,
    })
    return
  }
  await updateConnector(db.supabase, db.orgId, current.id, {
    name,
    config,
    enabled,
    status: enabled ? undefined : 'paused',
    secrets,
  })
}

export async function applyAssetProtocols(db: FogoDb, asset: { id: string; name: string }, body: AssetProtocolBody) {
  const touchesMqtt = body.mqttEnabled !== undefined || body.mqttHost !== undefined
  const touchesSnmp = body.snmpEnabled !== undefined || body.snmpHost !== undefined
  const touchesRtsp = body.rtspEnabled !== undefined || body.rtspHost !== undefined
  const touchesOnvif = body.onvifEnabled !== undefined || body.onvifHost !== undefined
  if (!touchesMqtt && !touchesSnmp && !touchesRtsp && !touchesOnvif) return

  const connectors = await listConnectors(db.supabase, db.orgId)

  if (touchesMqtt) {
    const enabled = body.mqttEnabled === true
    const host = String(body.mqttHost ?? '').trim()
    const tls = body.mqttTls === true
    const topics = splitList(body.mqttTopics).slice(0, 20)
    const port = parsePort(body.mqttPort, tls ? 8883 : 1883)
    if (enabled) requireHost('Broker MQTT', host)
    const current = bound(connectors, 'mqtt', asset.id)
    const secrets = await mergedSecrets(db, current, {
      username: body.mqttUsername,
      password: body.mqttPassword,
      mqttUser: body.mqttUsername,
      mqttPassword: body.mqttPassword,
    })
    await upsertBound(
      db,
      asset,
      'mqtt',
      enabled,
      {
        assetExternalId: asset.id,
        host,
        port,
        tls,
        topics,
        clientId: String(body.mqttClientId ?? '').trim() || undefined,
        username: String(body.mqttUsername ?? '').trim() || undefined,
        intervalSec: 60,
        allowPrivate: true,
      },
      secrets,
    )
  }

  if (touchesSnmp) {
    const enabled = body.snmpEnabled === true
    const host = String(body.snmpHost ?? '').trim()
    const version = body.snmpVersion === '3' ? '3' : '2c'
    const port = parsePort(body.snmpPort, 161)
    const oids = splitList(body.snmpOids).slice(0, 6)
    if (enabled) {
      requireHost('Agente SNMP', host)
      const bad = oids.find((oid) => !OID.test(oid))
      if (bad) throw new HttpError(400, `OID SNMP inválido: ${bad}`)
    }
    const current = bound(connectors, 'snmp', asset.id)
    const authProtocol = body.snmpAuthProtocol === 'MD5' ? 'MD5' : 'SHA'
    const privProtocol = body.snmpPrivProtocol === 'DES' ? 'DES' : 'AES'
    if (enabled && version === '2c' && !String(body.snmpCommunity ?? '').trim() && !current?.hasSecret) {
      throw new HttpError(400, 'Informe a comunidade SNMPv2c. Ela fica no cofre e não volta para a tela.')
    }
    if (enabled && version === '3' && !String(body.snmpUsername ?? '').trim() && !current?.hasSecret) {
      throw new HttpError(400, 'Informe o usuário SNMPv3.')
    }
    const secrets = await mergedSecrets(db, current, {
      community: version === '2c' ? body.snmpCommunity : undefined,
      username: body.snmpUsername,
      authPassword: body.snmpAuthPassword,
      privPassword: body.snmpPrivPassword,
    })
    await upsertBound(
      db,
      asset,
      'snmp',
      enabled,
      {
        assetExternalId: asset.id,
        host,
        port,
        version,
        oids,
        authProtocol,
        privProtocol,
        username: String(body.snmpUsername ?? '').trim() || undefined,
        intervalSec: 60,
        allowPrivate: true,
      },
      secrets,
    )
  }

  if (touchesRtsp) {
    const enabled = body.rtspEnabled === true
    const host = String(body.rtspHost ?? '').trim()
    const port = parsePort(body.rtspPort, 554)
    const path = slashPath(body.rtspPath, '/')
    if (enabled) requireHost('Câmera RTSP', host)
    const current = bound(connectors, 'rtsp', asset.id)
    const secrets = await mergedSecrets(db, current, {
      username: body.rtspUsername,
      password: body.rtspPassword,
    })
    await upsertBound(
      db,
      asset,
      'rtsp',
      enabled,
      {
        assetExternalId: asset.id,
        host,
        port,
        path,
        username: String(body.rtspUsername ?? '').trim() || undefined,
        intervalSec: 60,
        allowPrivate: true,
      },
      secrets,
    )
  }

  if (touchesOnvif) {
    const enabled = body.onvifEnabled === true
    const host = String(body.onvifHost ?? '').trim()
    const port = parsePort(body.onvifPort, 80)
    const path = slashPath(body.onvifPath, '/onvif/device_service')
    const tls = body.onvifTls === true
    if (enabled) requireHost('Equipamento ONVIF', host)
    const current = bound(connectors, 'onvif', asset.id)
    const secrets = await mergedSecrets(db, current, {
      username: body.onvifUsername,
      password: body.onvifPassword,
    })
    await upsertBound(
      db,
      asset,
      'onvif',
      enabled,
      {
        assetExternalId: asset.id,
        host,
        port,
        path,
        tls,
        username: String(body.onvifUsername ?? '').trim() || undefined,
        intervalSec: 60,
        allowPrivate: true,
      },
      secrets,
    )
  }
}

export async function attachAssetProtocols(db: FogoDb, assets: UrbanAsset[]): Promise<UrbanAsset[]> {
  const connectors = await listConnectors(db.supabase, db.orgId)
  return assets.map((asset) => {
    const mqtt = bound(connectors, 'mqtt', asset.id)
    const snmp = bound(connectors, 'snmp', asset.id)
    const rtsp = bound(connectors, 'rtsp', asset.id)
    const onvif = bound(connectors, 'onvif', asset.id)
    return {
      ...asset,
      mqttEnabled: mqtt?.enabled === true,
      mqttHost: mqtt ? String(mqtt.config.host ?? '') : undefined,
      mqttPort: mqtt ? Number(mqtt.config.port ?? 1883) : undefined,
      mqttTls: mqtt?.config.tls === true,
      mqttTopics: mqtt && Array.isArray(mqtt.config.topics) ? (mqtt.config.topics as unknown[]).map(String).join(', ') : undefined,
      mqttClientId: mqtt ? String(mqtt.config.clientId ?? '') : undefined,
      mqttUsername: mqtt ? String(mqtt.config.username ?? '') : undefined,
      mqttPasswordSet: mqtt?.hasSecret === true,
      snmpEnabled: snmp?.enabled === true,
      snmpHost: snmp ? String(snmp.config.host ?? '') : undefined,
      snmpPort: snmp ? Number(snmp.config.port ?? 161) : undefined,
      snmpVersion: snmp ? (String(snmp.config.version ?? '2c') === '3' ? '3' : '2c') : undefined,
      snmpOids: snmp && Array.isArray(snmp.config.oids) ? (snmp.config.oids as unknown[]).map(String).join(', ') : undefined,
      snmpCommunitySet: snmp?.hasSecret === true,
      snmpUsername: snmp ? String(snmp.config.username ?? '') : undefined,
      snmpAuthProtocol: snmp ? String(snmp.config.authProtocol ?? 'SHA') : undefined,
      snmpPrivProtocol: snmp ? String(snmp.config.privProtocol ?? 'AES') : undefined,
      rtspEnabled: rtsp?.enabled === true,
      rtspHost: rtsp ? String(rtsp.config.host ?? '') : undefined,
      rtspPort: rtsp ? Number(rtsp.config.port ?? 554) : undefined,
      rtspPath: rtsp ? String(rtsp.config.path ?? '/') : undefined,
      rtspUsername: rtsp ? String(rtsp.config.username ?? '') : undefined,
      rtspPasswordSet: rtsp?.hasSecret === true,
      rtspHealth: rtsp?.health,
      rtspLastError: rtsp?.lastError ?? undefined,
      rtspLastAttemptAt: rtsp?.lastAttemptAt ?? undefined,
      onvifEnabled: onvif?.enabled === true,
      onvifHost: onvif ? String(onvif.config.host ?? '') : undefined,
      onvifPort: onvif ? Number(onvif.config.port ?? 80) : undefined,
      onvifPath: onvif ? String(onvif.config.path ?? '/onvif/device_service') : undefined,
      onvifTls: onvif?.config.tls === true,
      onvifUsername: onvif ? String(onvif.config.username ?? '') : undefined,
      onvifPasswordSet: onvif?.hasSecret === true,
      onvifHealth: onvif?.health,
      onvifLastError: onvif?.lastError ?? undefined,
      onvifLastAttemptAt: onvif?.lastAttemptAt ?? undefined,
    }
  })
}
