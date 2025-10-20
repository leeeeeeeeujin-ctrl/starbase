/**
 * Match mode descriptors for rank and casual flows.
 *
 * These objects are meant to capture the high-level constraints of each lobby
 * before we plug the concrete Supabase adapters in. They let UI layers and
 * future services reason about what type of queue a user should join, how many
 * teammates they may bring, and whether spectators or brawl replacements are
 * allowed.
 */

export const MATCH_MODE_KEYS = Object.freeze({
  RANK_SHARED: 'rank_shared',
  RANK_SOLO: 'rank_solo',
  RANK_DUO: 'rank_duo',
  CASUAL_MATCH: 'casual_match',
  CASUAL_PRIVATE: 'casual_private',
})

/**
 * Shared queue groups let multiple entry points resolve to the same matching
 * pool. Solo/duo rank queues ultimately funnel into the same battle slots even
 * though the UI treats them as separate toggles.
 */
const QUEUE_GROUPS = Object.freeze({
  RANK: 'rank',
  CASUAL: 'casual',
  PRIVATE: 'private',
})

const RANK_SHARED_CONFIG = {
  key: MATCH_MODE_KEYS.RANK_SHARED,
  label: '랭크',
  queueGroup: QUEUE_GROUPS.RANK,
  queueModes: ['rank_shared', 'rank_solo', 'solo', 'rank_duo', 'duo', 'rank'],
  matcherKey: 'rank',
  defaultPartySize: 1,
  maxPartySize: 3,
  allowSpectators: false,
  allowBrawlReplacement: true,
  requiresFullActivation: true,
  description:
    '역할별 슬롯이 준비된 방을 만들거나 합류해 ±200점 범위 안의 참가자들과 매칭됩니다.',
}

export const MATCH_MODE_CONFIGS = Object.freeze({
  [MATCH_MODE_KEYS.RANK_SHARED]: RANK_SHARED_CONFIG,
  [MATCH_MODE_KEYS.RANK_SOLO]: RANK_SHARED_CONFIG,
  [MATCH_MODE_KEYS.RANK_DUO]: RANK_SHARED_CONFIG,
  [MATCH_MODE_KEYS.CASUAL_MATCH]: {
    key: MATCH_MODE_KEYS.CASUAL_MATCH,
    label: '캐주얼 매칭',
    queueGroup: QUEUE_GROUPS.CASUAL,
    queueModes: ['casual_match', 'casual'],
    matcherKey: 'casual',
    defaultPartySize: 1,
    maxPartySize: 4,
    allowSpectators: false,
    allowBrawlReplacement: false,
    requiresFullActivation: true,
    description:
      '점수 제한 없이 즐기는 빠른 매칭입니다. 캐주얼 전용 큐에서 상대를 찾습니다.',
  },
  [MATCH_MODE_KEYS.CASUAL_PRIVATE]: {
    key: MATCH_MODE_KEYS.CASUAL_PRIVATE,
    label: '사설 방',
    queueGroup: QUEUE_GROUPS.PRIVATE,
    queueModes: ['casual_private', 'private'],
    matcherKey: null,
    defaultPartySize: 1,
    maxPartySize: 12,
    allowSpectators: true,
    allowBrawlReplacement: true,
    requiresFullActivation: true,
    description:
      '점수 제한 없이 직접 슬롯을 채우는 사설 방입니다. 난입 허용 시 관전자도 참전할 수 있습니다.',
  },
})

export function getMatchModeConfig(mode) {
  if (!mode) return null
  if (MATCH_MODE_CONFIGS[mode]) {
    return MATCH_MODE_CONFIGS[mode]
  }
  return (
    Object.values(MATCH_MODE_CONFIGS).find((config) => config.queueModes?.includes(mode)) || null
  )
}

export function getQueueModes(mode) {
  const config = getMatchModeConfig(mode)
  if (!config) return mode ? [mode] : []
  const { queueModes } = config
  if (Array.isArray(queueModes) && queueModes.length > 0) {
    return Array.from(new Set(queueModes))
  }
  return [config.key]
}

export function getMatcherKey(mode) {
  const config = getMatchModeConfig(mode)
  return config?.matcherKey ?? null
}

export function getModeMetadata() {
  return Object.values(MATCH_MODE_CONFIGS)
}

export function isSpectatorAllowed(mode) {
  const config = getMatchModeConfig(mode)
  return Boolean(config?.allowSpectators)
}

export function requiresFullActivation(mode) {
  const config = getMatchModeConfig(mode)
  return config?.requiresFullActivation !== false
}

export function getDefaultPartySize(mode) {
  const config = getMatchModeConfig(mode)
  if (!config) return 1
  return config.defaultPartySize || 1
}

export function getMaxPartySize(mode) {
  const config = getMatchModeConfig(mode)
  if (!config) return 1
  return config.maxPartySize || config.defaultPartySize || 1
}
