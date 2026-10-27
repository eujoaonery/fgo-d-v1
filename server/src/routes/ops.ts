import { Router } from 'express'
import multer from 'multer'
import type { FogoRequest } from '../middleware/attachOrg.js'
import {
  createAsset,
  getAssetByExternalId,
  deleteAssetByExternalId,
  getIncident,
  insertIncidentHistory,
  listIncidentHistory,
  listAlerts,
  patchAlertState,
  assumeAlert,
  ClaimError,
  upsertAsset,
  upsertIncident,
  nextCounter,
  dispatchTeamToIncident,
  scheduleWorkOrder,
  DispatchError,
  getTeam,
  listAssetCategories,
  createMaintenanceOrder,
  patchMaintenanceStatus,
  listMaintenanceHistory,
  createMaintenanceFromAlert,
  upsertTeam,
  deleteTeamByExternalId,
  listAlertHistory,
  createIncidentFromAlert,
  createWorkOrder,
  linkAlertsToIncident,
  listAlertsForIncident,
  searchOperational,
  listRegionSummaries,
} from '../repository.js'
import {
  createWorkOrderSubject,
  getWorkOrderSubject,
  listWorkOrderSubjects,
  patchWorkOrderSubject,
} from '../workOrderSubjects.js'
import { subjectSuggestsOsType } from '../../../src/lib/occurrenceState.js'
import { listOperationalEvents } from '../telemetry.js'
import { writeAudit } from '../audit.js'
import type { OperationalTeam } from '../types.js'
import type { TeamCapability } from '../teamCapabilities.js'
import { requirePermission } from '../middleware/requirePermission.js'
import { requireAnyPermission } from '../middleware/requireAnyPermission.js'
import { filterSearchHits } from '../security/searchAccess.js'
import { actorRegion, filterAlertsForActor, filterAssetsForActor, filterTeamsForActor } from '../security/scopeFilter.js'
import { actorDisplayLabel } from '../actorLabel.js'
import type {
  AlertState,
  Incident,
  IncidentPriority,
  IncidentStatus,
  MaintenanceOrder,
  OsCloseImage,
  UrbanAsset,
} from '../types.js'
import { parseCloseImages } from '../../../src/lib/workOrders.js'
import {
  normalizeAgentFunctionalStatus,
  normalizeAgentOperationalStatus,
  parseShifts,
  parseStringList,
} from '../../../src/lib/agents.js'
import { CADASTRAL_JUSTIFICATION_MIN, cadastralStatusChanged, normalizeCadastral } from '../assets/truth.js'
import { isDegradationLevel } from '../../../src/lib/assetLifecycle.js'

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
})

function db(req: FogoRequest) {
  if (!req.fogoDb) throw new Error('fogoDb missing')
  return req.fogoDb
}

function requestAlertActor(req: FogoRequest) {
  const actor = req.fogoDb?.actor
  if (!actor?.userId) return undefined
  return { userId: actor.userId, label: actorDisplayLabel(actor) }
}

async function applyAssetIcmp(
  req: FogoRequest,
  asset: { id: string; name: string },
  body: { icmpEnabled?: boolean; icmpHost?: string },
) {
  const { applyIcmpFieldsFromBody } = await import('../monitoring/icmpAvailability.js')
  await applyIcmpFieldsFromBody(db(req), asset, body)
}

async function applyAssetProtocolConfig(
  req: FogoRequest,
  asset: { id: string; name: string },
  body: import('../monitoring/assetProtocols.js').AssetProtocolBody,
) {
  const { applyAssetProtocols } = await import('../monitoring/assetProtocols.js')
  await applyAssetProtocols(db(req), asset, body)
}

export function createOpsRouter() {
  const router = Router()

  router.get('/work-order-subjects', requirePermission('incidents', 'view'), async (req, res, next) => {
    try {
      const includeInactive = String(req.query.todos ?? '') === '1'
      res.json({ subjects: await listWorkOrderSubjects(db(req), { includeInactive }) })
    } catch (e) {
      next(e)
    }
  })

  router.post('/work-order-subjects', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : ''
      res.status(201).json(await createWorkOrderSubject(db(req), name))
    } catch (e) {
      if (e instanceof Error && /assunto/i.test(e.message)) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.patch('/work-order-subjects/:id', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const updated = await patchWorkOrderSubject(db(req), req.params.id, {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        active: typeof req.body?.active === 'boolean' ? req.body.active : undefined,
      })
      if (!updated) {
        res.status(404).json({ error: 'Assunto não encontrado' })
        return
      }
      res.json(updated)
    } catch (e) {
      if (e instanceof Error && /assunto/i.test(e.message)) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/incidents/:protocol/history', requirePermission('incidents', 'view'), async (req, res, next) => {
    try {
      res.json(await listIncidentHistory(db(req), req.params.protocol))
    } catch (e) {
      next(e)
    }
  })

  router.post('/incidents', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as {
        description?: string
        type?: string
        region?: string
        priority?: IncidentPriority
        relatedAssetId?: string
        location?: string
        assignee?: string
        dueAt?: string
        workOrderDescription?: string
        subjectId?: string
        sourceAlertId?: string
        sourcePredictionId?: string
        predictionDuplicateNote?: string
      }
      if (!body.subjectId?.trim()) {
        res.status(400).json({ error: 'Informe o assunto da ordem de serviço.' })
        return
      }
      const subject = await getWorkOrderSubject(db(req), body.subjectId.trim())
      if (!subject?.active) {
        res.status(400).json({ error: 'Assunto da ordem de serviço inválido.' })
        return
      }
      const description = body.description?.trim() || subject.name
      const type = body.type?.trim() || subjectSuggestsOsType(subject.name)
      if (body.sourcePredictionId?.trim()) {
        const { assertPredictionOsAllowed } = await import('../predictive/engine.js')
        await assertPredictionOsAllowed(db(req), body.sourcePredictionId.trim(), body.predictionDuplicateNote)
      }
      const incident = await createWorkOrder(db(req), {
        description,
        type,
        region: body.region,
        priority: body.priority,
        relatedAssetId: body.relatedAssetId,
        location: body.location,
        assignee: body.assignee,
        dueAt: body.dueAt,
        workOrderDescription: body.workOrderDescription?.trim() || subject.name,
        subjectId: subject.id,
        subjectLabel: subject.name,
        sourceAlertId: body.sourceAlertId?.trim() || undefined,
        sourcePredictionId: body.sourcePredictionId?.trim() || undefined,
        dataOrigin: 'manual',
      })
      if (body.sourcePredictionId?.trim()) {
        const { linkPredictionToWorkOrder } = await import('../predictive/engine.js')
        await linkPredictionToWorkOrder(
          db(req),
          body.sourcePredictionId.trim(),
          incident.id,
          body.predictionDuplicateNote,
        )
      }
      res.status(201).json(incident)
    } catch (e) {
      next(e)
    }
  })

  router.patch('/incidents/:id', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const { id } = req.params
      const existing = await getIncident(db(req), id)
      if (!existing) {
        res.status(404).json({ error: 'Ordem de serviço não encontrada' })
        return
      }
      const {
        status,
        assignee,
        notes,
        actorLabel,
        priority,
        dueAt,
        workOrderDescription,
        scheduledStart,
        scheduledEnd,
        diagnosis,
        materials,
        closeProblem,
        closeSolution,
        closeSignature,
        closeImages,
      } = req.body as {
        status?: IncidentStatus
        assignee?: string
        notes?: string
        actorLabel?: string
        priority?: IncidentPriority
        dueAt?: string
        workOrderDescription?: string
        scheduledStart?: string
        scheduledEnd?: string
        diagnosis?: string
        materials?: string
        closeProblem?: string
        closeSolution?: string
        closeSignature?: string
        closeImages?: OsCloseImage[]
      }
      const actor =
        actorLabel ??
        (req.fogoDb?.actor?.email ? `operador CCO (${req.fogoDb.actor.email})` : 'operador CCO')

      const updated: Incident = {
        ...existing,
        ...(status ? { status } : {}),
        ...(assignee !== undefined ? { assignee } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(priority ? { priority } : {}),
        ...(dueAt !== undefined ? { dueAt } : {}),
        ...(workOrderDescription !== undefined ? { workOrderDescription } : {}),
        ...(scheduledStart !== undefined ? { scheduledStart } : {}),
        ...(scheduledEnd !== undefined ? { scheduledEnd } : {}),
        ...(diagnosis !== undefined ? { diagnosis } : {}),
        ...(materials !== undefined ? { materials } : {}),
        ...(closeProblem !== undefined ? { closeProblem } : {}),
        ...(closeSolution !== undefined ? { closeSolution } : {}),
        ...(closeSignature !== undefined ? { closeSignature } : {}),
        ...(closeImages !== undefined ? { closeImages: parseCloseImages(closeImages) } : {}),
        ...(status === 'resolvida' ? { resolvedAt: new Date().toISOString() } : {}),
      }
      if (status && status !== existing.status) {
        await insertIncidentHistory(db(req), id, existing.status, status, notes, actor)
      }
      await upsertIncident(db(req), updated)
      if (status === 'resolvida') {
        await writeAudit(db(req), 'incident.resolve', 'incident', { protocol: id })
      }
      res.json(updated)
    } catch (e) {
      next(e)
    }
  })

  router.get('/assets', requirePermission('assets', 'view'), async (req, res, next) => {
    try {
      const { listAssets } = await import('../repository.js')
      res.json(filterAssetsForActor(await listAssets(db(req)), req.fogoDb?.actor))
    } catch (e) {
      next(e)
    }
  })

  router.post('/assets', requirePermission('assets', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as Partial<UrbanAsset> & {
        id?: string
        icmpEnabled?: boolean
        icmpHost?: string
        mqttPassword?: string
        snmpCommunity?: string
        snmpAuthPassword?: string
        snmpPrivPassword?: string
        rtspPassword?: string
        onvifPassword?: string
      }
      if (!body.name || !body.category || !body.region) {
        res.status(400).json({ error: 'name, category e region são obrigatórios' })
        return
      }
      let externalId = body.id?.trim()
      if (!externalId) {
        const n = await nextCounter(db(req), 'asset')
        const { prefixForCategory } = await import('../../../src/lib/assetCatalog.js')
        externalId = `${prefixForCategory(body.category)}-${1000 + n}`
      }
      const { blankAssetLocation, formatAssetAddress } = await import('../data/mariliaAddresses.js')
      const location = body.location ?? blankAssetLocation()
      const asset: UrbanAsset = {
        id: externalId,
        name: body.name,
        category: body.category,
        region: body.region,
        status: body.status ?? 'operacional',
        health: body.health ?? 100,
        lastSeen: new Date().toISOString(),
        mapX: body.mapX,
        mapY: body.mapY,
        patrimonyCode: body.patrimonyCode,
        serialNumber: body.serialNumber,
        manufacturer: body.manufacturer,
        model: body.model,
        location,
        address: body.address ?? (location.street ? formatAssetAddress(location) : ''),
        connectivityStatus: body.connectivityStatus,
        cadastralStatus: body.cadastralStatus ?? 'operacional',
        criticality: body.criticality,
        responsibleOrg: body.responsibleOrg,
        responsibleTeam: body.responsibleTeam,
        notes: body.notes,
        installedAt: body.installedAt,
        subtype: body.subtype,
        acquiredAt: body.acquiredAt,
        lastVerifiedAt: body.lastVerifiedAt,
        maintenanceIntervalDays: body.maintenanceIntervalDays,
        maintenanceNextDue: body.maintenanceNextDue,
        maintenanceLastDone: body.maintenanceLastDone,
        maintenancePlanNotes: body.maintenancePlanNotes,
        usefulLifeMonths:
          typeof body.usefulLifeMonths === 'number' && body.usefulLifeMonths > 0
            ? Math.floor(body.usefulLifeMonths)
            : undefined,
        degradationLevel: isDegradationLevel(body.degradationLevel) ? body.degradationLevel : undefined,
        createdBy: req.fogoDb?.actor?.email ?? req.fogoDb?.actor?.displayName,
        updatedBy: req.fogoDb?.actor?.email ?? req.fogoDb?.actor?.displayName,
        dataOrigin: 'manual',
        specs: body.specs,
      }
      await createAsset(db(req), asset)
      await applyAssetIcmp(req, asset, body)
      await applyAssetProtocolConfig(req, asset, body)
      asset.icmpEnabled = body.icmpEnabled === true
      asset.icmpHost = body.icmpEnabled === true ? String(body.icmpHost ?? '').trim() : undefined
      asset.mqttEnabled = body.mqttEnabled === true
      asset.mqttHost = String(body.mqttHost ?? '').trim() || undefined
      asset.mqttPort = body.mqttPort != null && String(body.mqttPort).trim() !== '' ? Number(body.mqttPort) : undefined
      asset.mqttTls = body.mqttTls === true
      asset.mqttTopics = String(body.mqttTopics ?? '').trim() || undefined
      asset.mqttClientId = String(body.mqttClientId ?? '').trim() || undefined
      asset.mqttUsername = String(body.mqttUsername ?? '').trim() || undefined
      asset.mqttPasswordSet = Boolean(String(body.mqttPassword ?? '').trim())
      asset.snmpEnabled = body.snmpEnabled === true
      asset.snmpHost = String(body.snmpHost ?? '').trim() || undefined
      asset.snmpPort = body.snmpPort != null && String(body.snmpPort).trim() !== '' ? Number(body.snmpPort) : undefined
      asset.snmpVersion = body.snmpVersion === '3' ? '3' : body.snmpEnabled ? '2c' : undefined
      asset.snmpOids = String(body.snmpOids ?? '').trim() || undefined
      asset.snmpUsername = String(body.snmpUsername ?? '').trim() || undefined
      asset.snmpAuthProtocol = body.snmpAuthProtocol === 'MD5' ? 'MD5' : 'SHA'
      asset.snmpPrivProtocol = body.snmpPrivProtocol === 'DES' ? 'DES' : 'AES'
      asset.snmpCommunitySet = Boolean(String(body.snmpCommunity ?? '').trim() || String(body.snmpAuthPassword ?? '').trim())
      asset.rtspEnabled = body.rtspEnabled === true
      asset.rtspHost = String(body.rtspHost ?? '').trim() || undefined
      asset.rtspPort = body.rtspPort != null && String(body.rtspPort).trim() !== '' ? Number(body.rtspPort) : undefined
      asset.rtspPath = String(body.rtspPath ?? '').trim() || undefined
      asset.rtspUsername = String(body.rtspUsername ?? '').trim() || undefined
      asset.rtspPasswordSet = Boolean(String(body.rtspPassword ?? '').trim())
      asset.onvifEnabled = body.onvifEnabled === true
      asset.onvifHost = String(body.onvifHost ?? '').trim() || undefined
      asset.onvifPort = body.onvifPort != null && String(body.onvifPort).trim() !== '' ? Number(body.onvifPort) : undefined
      asset.onvifPath = String(body.onvifPath ?? '').trim() || undefined
      asset.onvifTls = body.onvifTls === true
      asset.onvifUsername = String(body.onvifUsername ?? '').trim() || undefined
      asset.onvifPasswordSet = Boolean(String(body.onvifPassword ?? '').trim())
      res.status(201).json(asset)
    } catch (e) {
      if (e instanceof Error && e.message.includes('coordenada')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.post('/geo/suggest', requirePermission('assets', 'view'), async (req, res, next) => {
    try {
      const { q, cep, lat, lng } = req.body as { q?: string; cep?: string; lat?: number; lng?: number }
      const { parseMapMunicipality } = await import('../../../src/lib/mapMunicipality.js')
      const area = parseMapMunicipality(db(req).tenant?.settings)
      const { suggestByCep, suggestByQuery, reverseSuggest } = await import('../geo/suggest.js')
      if (cep) {
        const one = await suggestByCep(cep, area)
        res.json(one ? [one] : [])
        return
      }
      if (lat != null && lng != null) {
        const one = await reverseSuggest(Number(lat), Number(lng), area)
        res.json(one ? [one] : [])
        return
      }
      res.json(await suggestByQuery(String(q ?? ''), area))
    } catch (e) {
      next(e)
    }
  })

  router.get('/assets/:externalId/location-events', requirePermission('assets', 'view'), async (req, res, next) => {
    try {
      const { listLocationEvents } = await import('../assets/locations.js')
      res.json(await listLocationEvents(db(req), req.params.externalId))
    } catch (e) {
      next(e)
    }
  })

  router.post('/assets/:externalId/location-events', requirePermission('assets', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as { lat?: number; lng?: number; source?: string; accuracyM?: number }
      if (body.lat == null || body.lng == null) {
        res.status(400).json({ error: 'lat e lng são obrigatórios' })
        return
      }
      const { insertLocationEvent } = await import('../assets/locations.js')
      res.status(201).json(
        await insertLocationEvent(db(req), req.params.externalId, {
          lat: Number(body.lat),
          lng: Number(body.lng),
          source: body.source,
          accuracyM: body.accuracyM,
        }),
      )
    } catch (e) {
      if (e instanceof Error && (e.message.includes('coordenada') || e.message.includes('Latitude'))) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/assets/:externalId/attachments', requirePermission('assets', 'view'), async (req, res, next) => {
    try {
      const { listAssetAttachments } = await import('../assets/attachments.js')
      res.json(await listAssetAttachments(db(req), req.params.externalId))
    } catch (e) {
      next(e)
    }
  })

  router.post(
    '/assets/:externalId/attachments',
    requirePermission('assets', 'manage'),
    assetUpload.single('file'),
    async (req, res, next) => {
      try {
        const file = req.file
        if (!file) {
          res.status(400).json({ error: 'Arquivo é obrigatório' })
          return
        }
        const { uploadAssetAttachment } = await import('../assets/attachments.js')
        const kind = typeof req.body?.kind === 'string' ? req.body.kind : undefined
        res.status(201).json(await uploadAssetAttachment(db(req), req.params.externalId, file, kind))
      } catch (e) {
        if (e instanceof Error && (e.message.includes('Use PDF') || e.message.includes('10 MB'))) {
          res.status(400).json({ error: e.message })
          return
        }
        next(e)
      }
    },
  )

  router.get(
    '/assets/:externalId/attachments/:attId',
    requirePermission('assets', 'view'),
    async (req, res, next) => {
      try {
        const { downloadAssetAttachment } = await import('../assets/attachments.js')
        const file = await downloadAssetAttachment(db(req), req.params.externalId, req.params.attId)
        if (!file) {
          res.status(404).json({ error: 'Anexo não encontrado' })
          return
        }
        res.setHeader('Content-Type', file.contentType)
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`)
        res.send(file.buffer)
      } catch (e) {
        next(e)
      }
    },
  )

  router.delete(
    '/assets/:externalId/attachments/:attId',
    requirePermission('assets', 'manage'),
    async (req, res, next) => {
      try {
        const { deleteAssetAttachment } = await import('../assets/attachments.js')
        const ok = await deleteAssetAttachment(db(req), req.params.externalId, req.params.attId)
        if (!ok) {
          res.status(404).json({ error: 'Anexo não encontrado' })
          return
        }
        res.status(204).send()
      } catch (e) {
        next(e)
      }
    },
  )

  router.get('/assets/:externalId/history', requirePermission('assets', 'view'), async (req, res, next) => {
    try {
      const { listAssetHistory } = await import('../repository.js')
      res.json(await listAssetHistory(db(req), req.params.externalId))
    } catch (e) {
      next(e)
    }
  })

  router.patch('/assets/:externalId', requirePermission('assets', 'manage'), async (req, res, next) => {
    try {
      const existing = await getAssetByExternalId(db(req), String(req.params.externalId))
      if (!existing) {
        res.status(404).json({ error: 'Ativo não encontrado' })
        return
      }
      const body = req.body as Partial<UrbanAsset> & {
        cadastralJustification?: string
        mqttPassword?: string
        snmpCommunity?: string
        snmpAuthPassword?: string
        snmpPrivPassword?: string
        rtspPassword?: string
        onvifPassword?: string
      }
      const {
        connectivityStatus: _ignoredConnectivity,
        icmpEnabled,
        icmpHost,
        mqttPassword: _mqttPassword,
        snmpCommunity: _snmpCommunity,
        snmpAuthPassword: _snmpAuthPassword,
        snmpPrivPassword: _snmpPrivPassword,
        rtspPassword: _rtspPassword,
        onvifPassword: _onvifPassword,
        cadastralJustification,
        ...rest
      } = body
      const nextCadastral = body.cadastralStatus ?? existing.cadastralStatus
      if (cadastralStatusChanged(existing.cadastralStatus, nextCadastral)) {
        const just = cadastralJustification?.trim() ?? ''
        if (just.length < CADASTRAL_JUSTIFICATION_MIN) {
          res.status(400).json({
            error: `Justificativa obrigatória (mínimo ${CADASTRAL_JUSTIFICATION_MIN} caracteres) ao alterar a situação cadastral.`,
          })
          return
        }
      }
      const updated: UrbanAsset = {
        ...existing,
        ...rest,
        id: existing.id,
        cadastralStatus: nextCadastral ? normalizeCadastral(nextCadastral) : existing.cadastralStatus,
        location: body.location ? { ...existing.location, ...body.location } : existing.location,
        updatedBy: req.fogoDb?.actor?.email ?? req.fogoDb?.actor?.displayName ?? existing.updatedBy,
      }
      if ('usefulLifeMonths' in body) {
        updated.usefulLifeMonths =
          typeof body.usefulLifeMonths === 'number' && body.usefulLifeMonths > 0
            ? Math.floor(body.usefulLifeMonths)
            : undefined
      }
      if ('degradationLevel' in body) {
        updated.degradationLevel = isDegradationLevel(body.degradationLevel) ? body.degradationLevel : undefined
      }
      await upsertAsset(db(req), updated, 'asset.update', {
        cadastralJustification: cadastralJustification?.trim(),
      })
      await applyAssetIcmp(req, updated, { icmpEnabled, icmpHost })
      await applyAssetProtocolConfig(req, updated, body)
      updated.icmpEnabled = icmpEnabled === undefined ? existing.icmpEnabled : icmpEnabled === true
      updated.icmpHost = icmpHost !== undefined ? icmpHost : existing.icmpHost
      if (body.mqttPassword) updated.mqttPasswordSet = true
      if (body.snmpCommunity || body.snmpAuthPassword) updated.snmpCommunitySet = true
      if (body.rtspPassword) updated.rtspPasswordSet = true
      if (body.onvifPassword) updated.onvifPasswordSet = true
      res.json(updated)
    } catch (e) {
      if (e instanceof Error && (e.message.includes('coordenada') || e.message.includes('Latitude'))) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.delete('/assets/:externalId', requirePermission('assets', 'manage'), async (req, res, next) => {
    try {
      await applyAssetIcmp(req, { id: req.params.externalId, name: req.params.externalId }, { icmpEnabled: false, icmpHost: '' })
      await applyAssetProtocolConfig(req, { id: req.params.externalId, name: req.params.externalId }, {
        mqttEnabled: false,
        snmpEnabled: false,
        rtspEnabled: false,
        onvifEnabled: false,
      })
      const ok = await deleteAssetByExternalId(db(req), req.params.externalId)
      if (!ok) {
        res.status(404).json({ error: 'Ativo não encontrado' })
        return
      }
      res.status(204).send()
    } catch (e) {
      next(e)
    }
  })

  router.patch('/alerts/:protocol', requirePermission('alerts', 'manage'), async (req, res, next) => {
    try {
      const { state, note } = req.body as { state?: AlertState; note?: string }
      if (!state) {
        res.status(400).json({ error: 'state é obrigatório' })
        return
      }
      const updated = await patchAlertState(db(req), req.params.protocol, state, note, requestAlertActor(req))
      if (!updated) {
        res.status(404).json({ error: 'Ocorrência não encontrada' })
        return
      }
      res.json(updated)
    } catch (e) {
      if (e instanceof Error && /relato|finalizada|ordem de serviço/i.test(e.message)) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.post('/alerts/:protocol/assume', requirePermission('alerts', 'manage'), async (req, res, next) => {
    try {
      const actor = requestAlertActor(req)
      if (!actor) {
        res.status(401).json({ error: 'Autenticação necessária' })
        return
      }
      const updated = await assumeAlert(db(req), req.params.protocol, actor)
      res.json(updated)
    } catch (e) {
      if (e instanceof ClaimError) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'ALREADY_CLAIMED' ? 409 : 400
        res.status(status).json({ error: e.message, code: e.code })
        return
      }
      next(e)
    }
  })

  router.post('/incidents/:id/dispatch', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const { teamId } = req.body as { teamId?: string }
      if (!teamId?.trim()) {
        res.status(400).json({ error: 'teamId é obrigatório' })
        return
      }
      const result = await dispatchTeamToIncident(db(req), req.params.id, teamId.trim(), {
        actorLabel: actorDisplayLabel(req.fogoDb?.actor),
      })
      res.json(result)
    } catch (e) {
      if (e instanceof DispatchError) {
        res.status(400).json({ error: e.message, code: e.code })
        return
      }
      next(e)
    }
  })

  router.post('/incidents/:id/schedule', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const { teamId, start, end } = req.body as { teamId?: string; start?: string; end?: string }
      if (!teamId?.trim() || !start?.trim()) {
        res.status(400).json({ error: 'teamId e start são obrigatórios' })
        return
      }
      const result = await scheduleWorkOrder(db(req), req.params.id, {
        teamId: teamId.trim(),
        start: start.trim(),
        end: end?.trim(),
        actorLabel: actorDisplayLabel(req.fogoDb?.actor),
      })
      res.json(result)
    } catch (e) {
      if (e instanceof DispatchError) {
        res.status(400).json({ error: e.message, code: e.code })
        return
      }
      next(e)
    }
  })

  router.get('/alerts', requirePermission('alerts', 'view'), async (req, res, next) => {
    try {
      res.json(filterAlertsForActor(await listAlerts(db(req)), req.fogoDb?.actor))
    } catch (e) {
      next(e)
    }
  })

  router.get('/alerts/:protocol/history', requirePermission('alerts', 'view'), async (req, res, next) => {
    try {
      res.json(await listAlertHistory(db(req), req.params.protocol))
    } catch (e) {
      next(e)
    }
  })

  router.post('/alerts/:protocol/incident', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as {
        priority?: IncidentPriority
        dueAt?: string
        notes?: string
        description?: string
        subjectId?: string
      }
      const incident = await createIncidentFromAlert(db(req), req.params.protocol, body)
      res.status(201).json(incident)
    } catch (e) {
      if (e instanceof Error && /não encontrada|finalizada|assunto/i.test(e.message)) {
        res.status(e.message.includes('não encontrada') ? 404 : 400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/incidents/:protocol/alerts', requirePermission('incidents', 'view'), async (req, res, next) => {
    try {
      res.json(await listAlertsForIncident(db(req), req.params.protocol))
    } catch (e) {
      next(e)
    }
  })

  router.post('/incidents/:protocol/link-alerts', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const { alertProtocols } = req.body as { alertProtocols?: string[] }
      if (!alertProtocols?.length) {
        res.status(400).json({ error: 'alertProtocols é obrigatório' })
        return
      }
      await linkAlertsToIncident(db(req), req.params.protocol, alertProtocols)
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.get(
    '/search',
    requireAnyPermission(['incidents', 'alerts', 'assets', 'teams'], 'view'),
    async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '')
      const actor = req.fogoDb!.actor!
      const hits = await searchOperational(db(req), q)
      res.json(filterSearchHits(hits, actor))
    } catch (e) {
      next(e)
    }
  },
  )

  router.get(
    '/regions/summary',
    requireAnyPermission(['overview', 'incidents', 'alerts', 'assets'], 'view'),
    async (req, res, next) => {
    try {
      const summaries = await listRegionSummaries(db(req))
      const region = actorRegion(req.fogoDb?.actor)
      res.json(region ? summaries.filter((s) => s.region === region) : summaries)
    } catch (e) {
      next(e)
    }
  },
  )

  router.get(
    '/telemetry',
    requireAnyPermission(['cameraMonitor', 'overview', 'assets', 'analytics'], 'view'),
    async (req, res, next) => {
    try {
      const scoped = actorRegion(req.fogoDb?.actor)
      const region = scoped ?? (typeof req.query.region === 'string' ? req.query.region : undefined)
      const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100
      res.json(await listOperationalEvents(db(req), { region, assetExternalId: assetId, limit }))
    } catch (e) {
      next(e)
    }
  },
  )

  router.get(
    '/asset-categories',
    requireAnyPermission(['assets', 'cityInventory'], 'view'),
    async (req, res, next) => {
    try {
      res.json(await listAssetCategories(db(req)))
    } catch (e) {
      next(e)
    }
  },
  )

  router.post('/teams', requirePermission('teams', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as OperationalTeam
      if (!body.name || !body.region || !body.specialty) {
        res.status(400).json({ error: 'name, region e specialty são obrigatórios' })
        return
      }
      const id = body.id?.trim() || `AG-${(await nextCounter(db(req), 'team')).toString().padStart(3, '0')}`
      const team: OperationalTeam = {
        id,
        name: body.name,
        specialty: body.specialty,
        capabilities: (body.capabilities ?? []) as TeamCapability[],
        members: body.members ?? [],
        region: body.region,
        status: normalizeAgentOperationalStatus(body.status),
        mapX: body.mapX,
        mapY: body.mapY,
        registrationNumber: body.registrationNumber,
        responsibleOrg: body.responsibleOrg,
        unit: body.unit,
        jobTitle: body.jobTitle,
        qualifications: parseStringList(body.qualifications),
        functionalStatus: normalizeAgentFunctionalStatus(body.functionalStatus),
        shifts: parseShifts(body.shifts),
        locationShareUntil: body.locationShareUntil,
      }
      await upsertTeam(db(req), team, 'team.create')
      res.status(201).json(team)
    } catch (e) {
      next(e)
    }
  })

  router.patch('/teams/:externalId', requirePermission('teams', 'manage'), async (req, res, next) => {
    try {
      const existing = await getTeam(db(req), req.params.externalId)
      if (!existing) {
        res.status(404).json({ error: 'Agente não encontrado' })
        return
      }
      const body = req.body as Partial<OperationalTeam>
      const team: OperationalTeam = {
        ...existing,
        ...body,
        id: existing.id,
        status: body.status ? normalizeAgentOperationalStatus(body.status) : existing.status,
        functionalStatus: body.functionalStatus
          ? normalizeAgentFunctionalStatus(body.functionalStatus)
          : existing.functionalStatus,
        qualifications: body.qualifications !== undefined ? parseStringList(body.qualifications) : existing.qualifications,
        shifts: body.shifts !== undefined ? parseShifts(body.shifts) : existing.shifts,
      }
      await upsertTeam(db(req), team, 'team.update')
      res.json(team)
    } catch (e) {
      next(e)
    }
  })

  router.delete('/teams/:externalId', requirePermission('teams', 'manage'), async (req, res, next) => {
    try {
      const ok = await deleteTeamByExternalId(db(req), req.params.externalId)
      if (!ok) {
        res.status(404).json({ error: 'Agente não encontrado' })
        return
      }
      res.status(204).send()
    } catch (e) {
      next(e)
    }
  })

  router.post('/maintenance', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const body = req.body as Omit<MaintenanceOrder, 'id'>
      if (!body.assetName || !body.assignee || !body.dueDate) {
        res.status(400).json({ error: 'assetName, assignee e dueDate são obrigatórios' })
        return
      }
      const order = await createMaintenanceOrder(db(req), body)
      res.status(201).json(order)
    } catch (e) {
      next(e)
    }
  })

  router.patch('/maintenance/:id', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const { status, note } = req.body as { status?: MaintenanceOrder['status']; note?: string }
      if (!status) {
        res.status(400).json({ error: 'status é obrigatório' })
        return
      }
      const updated = await patchMaintenanceStatus(db(req), req.params.id, status, note)
      if (!updated) {
        res.status(404).json({ error: 'Ordem não encontrada' })
        return
      }
      res.json(updated)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Transição')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/maintenance/:id/history', requirePermission('incidents', 'view'), async (req, res, next) => {
    try {
      res.json(await listMaintenanceHistory(db(req), req.params.id))
    } catch (e) {
      next(e)
    }
  })

  router.post('/alerts/:protocol/maintenance', requirePermission('incidents', 'manage'), async (req, res, next) => {
    try {
      const order = await createMaintenanceFromAlert(db(req), req.params.protocol)
      res.status(201).json(order)
    } catch (e) {
      if (e instanceof Error && e.message === 'Alerta não encontrado') {
        res.status(404).json({ error: e.message })
        return
      }
      next(e)
    }
  })

  router.get('/weather/grid', requirePermission('analytics', 'view'), async (req, res, next) => {
    try {
      const { resolveCityGeo } = await import('../alpha/geoConfig.js')
      const { loadWeatherGrid } = await import('../strategy/weatherGrid.js')
      res.json(await loadWeatherGrid(resolveCityGeo(db(req))))
    } catch (e) {
      next(e)
    }
  })

  router.get('/weather/city', requirePermission('analytics', 'view'), async (req, res, next) => {
    try {
      const { fetchJson } = await import('../alpha/httpFetch.js')
      const { resolveCityGeo } = await import('../alpha/geoConfig.js')
      const { weatherCodeLabel } = await import('../alpha/weather.js')
      const geo = resolveCityGeo(db(req))
      const tz = encodeURIComponent(geo.timezone || 'America/Sao_Paulo')
      const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: geo.timezone || 'America/Sao_Paulo' }).format(
        new Date(Date.now() - 24 * 3600_000),
      )
      const forecastUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}` +
        `&current=temperature_2m,precipitation,weather_code&hourly=temperature_2m,precipitation,precipitation_probability` +
        `&forecast_days=2&timezone=${tz}`
      const archiveUrl =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lng}` +
        `&start_date=${yesterday}&end_date=${yesterday}&daily=precipitation_sum,temperature_2m_mean&timezone=${tz}`
      const [forecastRes, archiveRes] = await Promise.all([fetchJson(forecastUrl), fetchJson(archiveUrl)])
      const forecast = forecastRes.ok && forecastRes.data && typeof forecastRes.data === 'object' ? (forecastRes.data as Record<string, unknown>) : null
      const current = forecast && typeof forecast.current === 'object' && forecast.current ? (forecast.current as Record<string, unknown>) : null
      const hourly = forecast && typeof forecast.hourly === 'object' && forecast.hourly ? (forecast.hourly as Record<string, unknown>) : null
      const times = Array.isArray(hourly?.time) ? hourly.time : []
      const temps = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : []
      const rains = Array.isArray(hourly?.precipitation) ? hourly.precipitation : []
      const probs = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : []
      const nowIso = new Date().toISOString()
      const hours = times
        .map((time, i) => ({
          time: typeof time === 'string' ? time : '',
          temperatureC: typeof temps[i] === 'number' ? temps[i] : null,
          precipitationMm: typeof rains[i] === 'number' ? rains[i] : null,
          precipProbPct: typeof probs[i] === 'number' ? probs[i] : null,
        }))
        .filter((row) => row.time && row.time >= nowIso.slice(0, 13))
        .slice(0, 12)
      const archive = archiveRes.ok && archiveRes.data && typeof archiveRes.data === 'object' ? (archiveRes.data as Record<string, unknown>) : null
      const daily = archive && typeof archive.daily === 'object' && archive.daily ? (archive.daily as Record<string, unknown>) : null
      const code = typeof current?.weather_code === 'number' ? current.weather_code : null
      res.json({
        point: { lat: geo.lat, lng: geo.lng, city: geo.cityName },
        current: current
          ? {
              time: typeof current.time === 'string' ? current.time : null,
              temperatureC: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
              precipitationMm: typeof current.precipitation === 'number' ? current.precipitation : null,
              summary: weatherCodeLabel(code),
              kind: 'modelo_atual',
            }
          : null,
        forecastHours: hours,
        history: daily
          ? {
              date: yesterday,
              precipitationMm: Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum[0] ?? null : null,
              temperatureC: Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean[0] ?? null : null,
              kind: 'arquivo',
            }
          : null,
        error: !forecast && !archive ? 'Open-Meteo indisponível.' : null,
        note: 'Ponto único do modelo para a cidade. Não é estação de bairro nem aviso do INMET.',
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/analytics', requirePermission('analytics', 'view'), async (req, res, next) => {
    try {
      const { computeAnalytics } = await import('../analytics/compute.js')
      const period = (req.query.period === '24h' || req.query.period === '30d' ? req.query.period : '7d') as
        | '24h'
        | '7d'
        | '30d'
      const region =
        actorRegion(req.fogoDb?.actor) ??
        (typeof req.query.region === 'string' && req.query.region ? req.query.region : undefined)
      res.json(await computeAnalytics(db(req), period, region))
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictive/summary', requirePermission('predictiveIntel', 'view'), async (req, res, next) => {
    try {
      const { computePredictiveSummary } = await import('../predictive/engine.js')
      res.json(await computePredictiveSummary(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictions/os-by-region', requireAnyPermission(['analytics', 'predictiveIntel'], 'view'), async (req, res, next) => {
    try {
      const { listRegionalOsForecasts, maybeRunPredictiveRules } = await import('../predictive/engine.js')
      await maybeRunPredictiveRules(db(req))
      res.json(await listRegionalOsForecasts(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictions', requireAnyPermission(['forecasts', 'predictiveIntel'], 'view'), async (req, res, next) => {
    try {
      const { isOsTicketPrediction, listPredictions } = await import('../predictive/engine.js')
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50
      const rows = await listPredictions(db(req), Number.isFinite(limit) && limit > 0 ? limit : 50, {
        excludeDemand: true,
      })
      res.json(rows.filter((row) => !isOsTicketPrediction(row)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/predictions/:externalId/review', requirePermission('predictiveIntel', 'manage'), async (req, res, next) => {
    try {
      const { reviewPrediction } = await import('../predictive/engine.js')
      const body = req.body as {
        status?: 'confirmed' | 'missed' | 'partial' | 'expired'
        note?: string
        observedValue?: number
      }
      if (!body.status) {
        res.status(400).json({ error: 'status é obrigatório' })
        return
      }
      const actor =
        req.fogoDb?.actor?.email ? `operador CCO (${req.fogoDb.actor.email})` : 'operador CCO'
      await reviewPrediction(db(req), req.params.externalId, body, actor)
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/predictions/:externalId/decision', requirePermission('predictiveIntel', 'manage'), async (req, res, next) => {
    try {
      const { decidePrediction } = await import('../predictive/engine.js')
      const body = req.body as { status?: 'accepted' | 'rejected' | 'deferred' | 'irrelevant'; justification?: string }
      if (!body.status || !body.justification) {
        res.status(400).json({ error: 'status e justificativa são obrigatórios' })
        return
      }
      const actor =
        req.fogoDb?.actor?.email ? `operador CCO (${req.fogoDb.actor.email})` : 'operador CCO'
      await decidePrediction(db(req), req.params.externalId, { status: body.status, justification: body.justification }, actor)
      await writeAudit(db(req), 'prediction.decision', 'prediction', {
        status: body.status,
        id: req.params.externalId,
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictive/metrics', requirePermission('predictiveIntel', 'view'), async (req, res, next) => {
    try {
      const { isOsTicketPrediction, listPredictions } = await import('../predictive/engine.js')
      const { computePredictiveMetrics } = await import('../predictive/metrics.js')
      const rows = (await listPredictions(db(req), 200)).filter((row) => !isOsTicketPrediction(row))
      res.json(computePredictiveMetrics(rows))
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictive/previsibilidade', requirePermission('predictiveIntel', 'view'), async (req, res, next) => {
    try {
      const { getPrevisibilidadeState } = await import('../predictive/prometheusFeedback.js')
      res.json(await getPrevisibilidadeState(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/predictive/previsibilidade', requirePermission('predictiveIntel', 'view'), async (req, res, next) => {
    try {
      const { runPrometheusPrevisibilidade } = await import('../predictive/prometheusFeedback.js')
      const result = await runPrometheusPrevisibilidade(db(req))
      await writeAudit(db(req), 'predictive.prometheus', 'previsibilidade', {
        available: result.available,
      })
      res.json(result)
    } catch (e) {
      next(e)
    }
  })

  router.get('/assets/export.csv', requirePermission('assets', 'export'), async (req, res, next) => {
    try {
      const { listAssets } = await import('../repository.js')
      const { assetsToCsv } = await import('../csv/assetsCsv.js')
      const csv = assetsToCsv(filterAssetsForActor(await listAssets(db(req)), req.fogoDb?.actor))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="fogo-ativos.csv"')
      res.send('\uFEFF' + csv)
    } catch (e) {
      next(e)
    }
  })

  router.get('/assets/import-template.csv', requirePermission('assets', 'view'), async (_req, res, next) => {
    try {
      const { assetCsvTemplate } = await import('../csv/assetsCsv.js')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.send('\uFEFF' + assetCsvTemplate())
    } catch (e) {
      next(e)
    }
  })

  router.post('/assets/import.csv', requirePermission('assets', 'manage'), async (req, res, next) => {
    try {
      const { csv } = req.body as { csv?: string }
      if (!csv?.trim()) {
        res.status(400).json({ error: 'csv é obrigatório' })
        return
      }
      const { parseAssetsCsv } = await import('../csv/assetsCsv.js')
      const { upsertAsset, createAsset } = await import('../repository.js')
      const { blankAssetLocation } = await import('../data/mariliaAddresses.js')
      const rows = parseAssetsCsv(csv)
      let imported = 0
      for (const row of rows) {
        const id = row.id ?? `ATV-${Date.now()}-${imported}`
        const location = blankAssetLocation()
        const asset = {
          id,
          name: row.name,
          category: row.category,
          region: row.region,
          status: row.status ?? 'operacional',
          health: row.health ?? 100,
          lastSeen: new Date().toISOString(),
          mapX: row.mapX,
          mapY: row.mapY,
          patrimonyCode: row.patrimonyCode,
          serialNumber: row.serialNumber,
          manufacturer: row.manufacturer,
          model: row.model,
          location,
          address: row.address ?? '',
          connectivityStatus: row.connectivityStatus,
          cadastralStatus: row.cadastralStatus ?? 'operacional',
          criticality: row.criticality,
          responsibleOrg: row.responsibleOrg,
          responsibleTeam: row.responsibleTeam,
          notes: row.notes,
          subtype: row.subtype,
          acquiredAt: row.acquiredAt,
          installedAt: row.installedAt,
          lastVerifiedAt: row.lastVerifiedAt,
          dataOrigin: 'importado' as const,
        }
        if (row.id) await upsertAsset(db(req), asset, 'asset.update')
        else await createAsset(db(req), asset)
        imported++
      }
      await writeAudit(db(req), 'asset.import', 'asset', null, { imported })
      res.json({ imported })
    } catch (e) {
      next(e)
    }
  })

  router.get('/teams/export.csv', requirePermission('teams', 'export'), async (req, res, next) => {
    try {
      const { listTeams } = await import('../repository.js')
      const { teamsToCsv } = await import('../csv/teamsCsv.js')
      const csv = teamsToCsv(filterTeamsForActor(await listTeams(db(req)), req.fogoDb?.actor))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="fogo-agentes.csv"')
      res.send('\uFEFF' + csv)
    } catch (e) {
      next(e)
    }
  })

  router.post('/teams/import.csv', requirePermission('teams', 'manage'), async (req, res, next) => {
    try {
      const { csv } = req.body as { csv?: string }
      if (!csv?.trim()) {
        res.status(400).json({ error: 'csv é obrigatório' })
        return
      }
      const { parseTeamsCsv } = await import('../csv/teamsCsv.js')
      const { upsertTeam } = await import('../repository.js')
      const rows = parseTeamsCsv(csv)
      let imported = 0
      for (const row of rows) {
        await upsertTeam(
          db(req),
          {
            id: row.id ?? `AG-${100 + imported}`,
            name: row.name,
            specialty: row.specialty,
            region: row.region,
            status: row.status ?? 'disponível',
            capabilities: row.capabilities ?? [],
            members: row.members ?? [],
            mapX: row.mapX,
            mapY: row.mapY,
            registrationNumber: row.registrationNumber,
            responsibleOrg: row.responsibleOrg,
            unit: row.unit,
            jobTitle: row.jobTitle,
            qualifications: row.qualifications,
            functionalStatus: row.functionalStatus ?? 'ativo',
          },
          'team.create',
        )
        imported++
      }
      await writeAudit(db(req), 'team.import', 'team', null, { imported })
      res.json({ imported })
    } catch (e) {
      next(e)
    }
  })

  router.get('/predictive/controls', requirePermission('predictiveIntel', 'view'), async (req, res, next) => {
    try {
      const { getPredictiveControls, listPredictiveRuns } = await import('../predictive/controls.js')
      const controls = await getPredictiveControls(db(req))
      const runs = await listPredictiveRuns(db(req), 12)
      res.json({ controls, runs })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/predictive/controls', requirePermission('settings', 'manage'), async (req, res, next) => {
    try {
      const { patchPredictiveControls } = await import('../predictive/controls.js')
      const body = req.body as {
        learningEnabled?: boolean
        forecastsEnabled?: boolean
        evaluationEnabled?: boolean
        retrainEnabled?: boolean
        includeSimulated?: boolean
        intervalSec?: number
      }
      const actor = req.fogoDb?.actor?.email ?? 'operador CCO'
      const controls = await patchPredictiveControls(db(req), body, actor)
      res.json({ controls })
    } catch (e) {
      next(e)
    }
  })

  router.post('/predictive/neural-official', requirePermission('settings', 'manage'), async (req, res, next) => {
    try {
      const { provisionNeuralOfficial } = await import('../predictive/engine.js')
      res.json(await provisionNeuralOfficial(db(req)))
    } catch (e) {
      next(e)
    }
  })

  router.post('/predictive/run', requirePermission('settings', 'manage'), async (req, res, next) => {
    try {
      const { runPredictiveCycle } = await import('../predictive/engine.js')
      await runPredictiveCycle(db(req))
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  return router
}
