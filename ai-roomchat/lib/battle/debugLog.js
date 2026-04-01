import { supabaseAdmin } from '@/lib/supabaseAdmin';

function normalizeValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, normalizeValue(entryValue)])
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export async function writeBattleDebugLog(entry = {}) {
  const row = {
    scope: String(entry.scope || 'battle'),
    event_type: String(entry.eventType || 'unknown'),
    owner_id: entry.ownerId || null,
    game_id: entry.gameId || null,
    hero_id: entry.heroId || null,
    text_session_id: entry.textSessionId || null,
    status: entry.status || null,
    payload: normalizeValue(entry.payload || {}),
  };

  try {
    const { error } = await supabaseAdmin.from('battle_debug_logs').insert(row);
    if (error) {
      console.error('[battle-debug-log] insert failed', error);
    }
  } catch (error) {
    console.error('[battle-debug-log] unexpected failure', error);
  }
}
