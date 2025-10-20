import { applySanitizedRoster } from '@/services/rank/matchRoster'
import {
  extractBearerToken,
  parseStageRequestBody,
} from '@/services/rank/matchStageRequest'
import {
  callPrepareMatchSession,
  fetchHeroSummaries,
  fetchParticipantStats,
  fetchRoomContext,
  fetchUserByToken,
  mergeRosterMetadata,
  verifyRolesAndSlots,
} from '@/services/rank/matchSupabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const token = extractBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const userResult = await fetchUserByToken(token)
  if (!userResult.ok) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const parseResult = parseStageRequestBody(req.body)
  if (!parseResult.ok) {
    return res.status(400).json({ error: parseResult.error })
  }

  const payload = parseResult.value

  const roomResult = await fetchRoomContext(payload.roomId)
  if (!roomResult.ok) {
    return res.status(roomResult.status).json(roomResult.body)
  }

  const roomOwnerId = roomResult.ownerId
  if (!roomOwnerId || roomOwnerId !== userResult.user.id) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const matchMode = payload.matchMode || roomResult.mode || null
  const slotTemplate = {
    version:
      payload.slotTemplate.version ?? roomResult.slotTemplate.version ?? null,
    source: payload.slotTemplate.source ?? roomResult.slotTemplate.source ?? null,
    updatedAt:
      payload.slotTemplate.updatedAt ?? roomResult.slotTemplate.updatedAt ?? null,
  }

  const verification = await verifyRolesAndSlots(
    payload.verificationRoles,
    payload.verificationSlots,
  )
  if (!verification.ok) {
    return res.status(verification.status).json(verification.body)
  }

  const participantResult = await fetchParticipantStats(payload.gameId, payload.roster)
  if (!participantResult.ok) {
    return res.status(participantResult.status).json(participantResult.body)
  }

  const heroResult = await fetchHeroSummaries(payload.roster, payload.heroMap)
  if (!heroResult.ok) {
    return res.status(heroResult.status).json(heroResult.body)
  }

  const hydratedRoster = mergeRosterMetadata({
    roster: payload.roster,
    participantMap: participantResult.map,
    heroSummaryResult: heroResult,
  })

  const rpcResult = await callPrepareMatchSession({
    roomId: payload.roomId,
    gameId: payload.gameId,
    matchInstanceId: payload.matchInstanceId,
    requestOwnerId: userResult.user.id,
    roster: hydratedRoster,
    readyVote: payload.readyVote,
    asyncFillMeta: payload.asyncFillMeta,
    mode: matchMode,
    slotTemplate,
    allowPartial: payload.allowPartial,
  })

  if (!rpcResult.ok) {
    return res.status(rpcResult.status).json(rpcResult.body)
  }

  const reconciledRoster = applySanitizedRoster(
    hydratedRoster,
    rpcResult.data.sanitizedRoster,
  )

  return res.status(200).json({
    session_id: rpcResult.data.sessionId,
    slot_template_version: rpcResult.data.slotTemplateVersion,
    slot_template_updated_at: rpcResult.data.slotTemplateUpdatedAt,
    queue: {
      reconciled: rpcResult.data.queueReconciled,
      inserted: rpcResult.data.queueInserted,
      removed: rpcResult.data.queueRemoved,
    },
    roster: reconciledRoster,
  })
}
