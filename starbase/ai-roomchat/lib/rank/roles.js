// lib/rank/roles.js
import { supabase } from './db'

export async function getActiveRoles(gameId) {
  const { data, error } = await supabase
    .from('rank_game_roles')
    .select('id,name,slot_count')
    .eq('game_id', gameId)
    .eq('active', true)
    .order('id')
  if (error) throw error
  return data || []
}

export function totalSlots(roles) {
  return roles.reduce((s, r) => s + (r.slot_count || 0), 0)
}
