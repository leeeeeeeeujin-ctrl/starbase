// lib/rank/persist.js
import { supabase } from './db'

function coerceUuidArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => item).filter(Boolean)
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return fallback
}

function resolveStatus(outcome, perspective) {
  if (perspective === 'defender') {
    if (outcome === 'win') return 'defeated'
    if (outcome === 'lose') return 'victory'
    return 'active'
  }

  if (outcome === 'win') return 'victory'
  if (outcome === 'lose') return 'defeated'
  return 'active'
}

function normalizeTurnLogs({ turnLogs, fallbackPrompt, fallbackResponse, outcome, gameId, battleId }) {
  const fallbackEntry = {
    game_id: gameId,
    battle_id: battleId,
    turn_no: 1,
    prompt: fallbackPrompt || '',
    ai_response: fallbackResponse || '',
    meta: { outcome },
  }

  if (!Array.isArray(turnLogs) || turnLogs.length === 0) {
    return [fallbackEntry]
  }

  const seenTurns = new Set()
  const rows = []

  turnLogs.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return

    const rawTurn = entry.turn_no ?? entry.turnNo ?? entry.index ?? index + 1
    let turnNo = coerceNumber(rawTurn, index + 1)
    while (seenTurns.has(turnNo) || turnNo <= 0) {
      turnNo += 1
    }
    seenTurns.add(turnNo)

    const prompt = typeof entry.prompt === 'string' ? entry.prompt : fallbackPrompt || ''
    const response =
      typeof entry.ai_response === 'string'
        ? entry.ai_response
        : typeof entry.aiResponse === 'string'
        ? entry.aiResponse
        : fallbackResponse || ''

    let meta = entry.meta
    if (!meta || typeof meta !== 'object') {
      meta = { outcome }
    } else if (!('outcome' in meta)) {
      meta = { ...meta, outcome }
    }

    rows.push({
      game_id: gameId,
      battle_id: battleId,
      turn_no: turnNo,
      prompt,
      ai_response: response,
      meta,
    })
  })

  if (!rows.length) {
    return [fallbackEntry]
  }

  return rows.sort((a, b) => a.turn_no - b.turn_no)
}

export async function recordBattle({
  game,
  userId,
  myHeroIds,
  oppOwnerIds,
  oppHeroIds,
  outcome,
  delta,
  prompt,
  aiText,
  turnLogs,
}) {
  const attackerHeroIds = coerceUuidArray(myHeroIds)
  const defenderHeroIds = coerceUuidArray(oppHeroIds)
  const defenderOwners = Array.isArray(oppOwnerIds) ? oppOwnerIds.filter(Boolean) : []
  const numericDelta = coerceNumber(delta, 0)
  const now = new Date().toISOString()

  const { data: battle, error: battleError } = await supabase
    .from('rank_battles')
    .insert({
      game_id: game.id,
      attacker_owner_id: userId,
      attacker_hero_ids: attackerHeroIds,
      defender_owner_id: defenderOwners[0] || null,
      defender_hero_ids: defenderHeroIds,
      result: outcome,
      score_delta: numericDelta,
      hidden: false,
      created_at: now,
    })
    .select()
    .single()

  if (battleError) throw battleError

  const logsPayload = normalizeTurnLogs({
    turnLogs,
    fallbackPrompt: prompt,
    fallbackResponse: aiText,
    outcome,
    gameId: game.id,
    battleId: battle.id,
  })

  const { error: logsError } = await supabase.from('rank_battle_logs').insert(logsPayload)
  if (logsError) throw logsError

  const { data: currentParticipant, error: participantError } = await supabase
    .from('rank_participants')
    .select('rating, score, battles, hero_id, hero_ids')
    .eq('game_id', game.id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (participantError) throw participantError

  const baseRating = coerceNumber(currentParticipant?.rating, 1000)
  const baseScore = coerceNumber(currentParticipant?.score, baseRating)
  const baseBattles = coerceNumber(currentParticipant?.battles, 0)
  const mergedHeroIds = (() => {
    const existing = Array.isArray(currentParticipant?.hero_ids)
      ? currentParticipant.hero_ids.filter(Boolean)
      : []
    const set = new Set(existing)
    attackerHeroIds.forEach((id) => set.add(id))
    return Array.from(set)
  })()

  const status = resolveStatus(outcome, 'attacker')

  const { error: upsertError } = await supabase
    .from('rank_participants')
    .upsert(
      {
        game_id: game.id,
        owner_id: userId,
        hero_id: attackerHeroIds[0] || currentParticipant?.hero_id || null,
        hero_ids: mergedHeroIds,
        rating: baseRating + numericDelta,
        score: baseScore + numericDelta,
        battles: baseBattles + 1,
        status,
        updated_at: now,
      },
      { onConflict: 'game_id,owner_id' },
    )

  if (upsertError) throw upsertError

  return {
    battleId: battle.id,
    attackerStatus: status,
    defenderStatus: resolveStatus(outcome, 'defender'),
    defenderOwners,
  }
}
