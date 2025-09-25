// lib/rank/persist.js
import { supabase } from './db'

export async function recordBattle({ game, userId, myHeroIds, oppOwnerIds, oppHeroIds, outcome, delta, prompt, aiText }) {
  const { data: battle, error } = await supabase.from('rank_battles').insert({
    game_id: game.id,
    attacker_owner_id: userId,
    attacker_hero_ids: myHeroIds,
    defender_owner_id: oppOwnerIds[0] || null, // 대표 하나만 기록(MVP)
    defender_hero_ids: oppHeroIds,
    result: outcome,
    score_delta: delta,
    hidden: false
  }).select().single()
  if (error) throw error

  await supabase.from('rank_battle_logs').insert({
    battle_id: battle.id,
    turn_no: 1,
    prompt,
    ai_response: aiText,
    meta: { outcome }
  })

  // 간단 점수 반영(MVP: 누적)
  const { data: cur } = await supabase
    .from('rank_participants')
    .select('rating, battles')
    .eq('game_id', game.id).eq('owner_id', userId).maybeSingle()

  const rating = (cur?.rating ?? 1000) + delta
  const battles = (cur?.battles ?? 0) + 1

  await supabase
    .from('rank_participants')
    .upsert({ game_id: game.id, owner_id: userId, hero_ids: myHeroIds, rating, battles }, { onConflict: 'game_id,owner_id' })

  return battle.id
}
