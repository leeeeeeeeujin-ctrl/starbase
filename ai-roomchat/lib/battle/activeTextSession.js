import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const ACTIVE_TEXT_BATTLE_STATUSES = ['active'];

export function formatActiveTextBattleSessionRecord(sessionRow = {}) {
  if (!sessionRow || typeof sessionRow !== 'object' || !sessionRow.id) {
    return null;
  }
  return {
    sessionId: sessionRow.id,
    promptSetId: sessionRow.prompt_set_id || null,
    gameName: sessionRow.game_name || '',
    href: `/text-battle/session/${encodeURIComponent(String(sessionRow.id))}`,
    status: String(sessionRow.status || 'active').trim().toLowerCase() || 'active',
    updatedAt: sessionRow.updated_at || sessionRow.created_at || new Date().toISOString(),
  };
}

export async function findActiveTextBattleSessionForOwner(ownerId) {
  const normalizedOwnerId = String(ownerId || '').trim();
  if (!normalizedOwnerId) return null;

  const { data, error } = await supabaseAdmin
    .from('text_battle_sessions')
    .select('id, owner_id, prompt_set_id, game_name, status, created_at, updated_at')
    .eq('owner_id', normalizedOwnerId)
    .in('status', ACTIVE_TEXT_BATTLE_STATUSES)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}
