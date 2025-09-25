// lib/rank/persist.js
import { supabase } from './db'
import { withTable } from '@/lib/supabaseTables'

export async function recordBattle({ game, userId, myHeroIds, oppOwnerIds, oppHeroIds, outcome, delta, prompt, aiText }) {
  const { data: battle, error } = await withTable(supabase, 'rank_battles', (table) =>
    supabase
      .from(table)
      .insert({
        game_id: game.id,
        attacker_owner_id: userId,
        attacker_hero_ids: myHeroIds,
        defender_owner_id: oppOwnerIds[0] || null, // 대표 하나만 기록(MVP)
        defender_hero_ids: oppHeroIds,
        result: outcome,
        score_delta: delta,
        hidden: false,
      })
      .select()
      .single(),
  )
  if (error) throw error

  const logResult = await withTable(supabase, 'rank_battle_logs', (table) =>
    supabase.from(table).insert({
      battle_id: battle.id,
      turn_no: 1,
      prompt,
      ai_response: aiText,
      meta: { outcome },
    }),
  )
  if (logResult.error) throw logResult.error

  // 간단 점수 반영(MVP: 누적)
  const { data: cur } = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .select('rating, battles')
      .eq('game_id', game.id)
      .eq('owner_id', userId)
      .maybeSingle(),
  )

  const rating = (cur?.rating ?? 1000) + delta
  const battles = (cur?.battles ?? 0) + 1

  const upsertResult = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .upsert(
        { game_id: game.id, owner_id: userId, hero_ids: myHeroIds, rating, battles },
        { onConflict: 'game_id,owner_id' },
      ),
  )
  if (upsertResult.error) throw upsertResult.error

  return battle.id
}

// 
