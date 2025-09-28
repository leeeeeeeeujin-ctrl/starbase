const FALLBACK_TABLES = {
  heroes: ['heroes', 'rank_heroes', 'games'],
  friend_requests: ['friend_requests'],
  friendships: ['friendships'],
  rank_games: ['rank_games', 'rank_games_view'],
  rank_participants: ['rank_participants', 'rank_players', 'rank_session_players'],
  rank_game_roles: ['rank_game_roles', 'rank_games_roles'],
  rank_battles: ['rank_battles', 'rank_sessions', 'session_logs'],
  rank_battle_logs: ['rank_battle_logs', 'rank_session_logs', 'session_logs'],
  rank_turns: ['rank_turns', 'rank_session_turns', 'session_turns', 'rank_session_logs'],
}

const resolvedTableCache = {}

function normaliseCandidates(logical) {
  const preset = FALLBACK_TABLES[logical] || [logical]
  const cached = resolvedTableCache[logical]
  if (!cached) return preset
  const unique = new Set([cached, ...preset])
  return Array.from(unique)
}

function isMissingTableError(error, tableName) {
  if (!error) return false
  if (error.code === '42P01') return true
  const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (!merged.trim()) return false
  if (merged.includes('does not exist')) return true
  if (merged.includes('not exist')) return true
  if (merged.includes('undefined table')) return true
  if (merged.includes(`relation "${tableName.toLowerCase()}"`)) return true
  if (merged.includes(`table "${tableName.toLowerCase()}"`)) return true
  return false
}

function wrapResult(result, tableName, logical) {
  if (!result) return { data: null, error: null, table: tableName }
  const { error } = result
  if (!error) {
    resolvedTableCache[logical] = tableName
    return { ...result, table: tableName }
  }
  return { ...result, table: tableName }
}

export async function withTable(supabaseClient, logicalName, executor) {
  const candidates = normaliseCandidates(logicalName)
  let lastMissing = null
  for (const tableName of candidates) {
    const result = await executor(tableName)
    const wrapped = wrapResult(result, tableName, logicalName)
    if (!wrapped.error) return wrapped
    if (isMissingTableError(wrapped.error, tableName)) {
      if (resolvedTableCache[logicalName] === tableName) {
        delete resolvedTableCache[logicalName]
      }
      lastMissing = wrapped
      continue
    }
    return wrapped
  }
  return lastMissing || { data: null, error: new Error(`No accessible table for ${logicalName}`) }
}

export function getResolvedTable(logicalName) {
  return resolvedTableCache[logicalName] || null
}

// 

