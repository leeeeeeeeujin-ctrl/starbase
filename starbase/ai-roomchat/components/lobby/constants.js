export const NAV_LINKS = []

export const LOBBY_TABS = [
  { key: 'games', label: '게임 검색' },
  { key: 'stats', label: '캐릭터 통계' },
]

export const SORT_OPTIONS = [
  { key: 'latest', label: '최신순', orders: [{ column: 'created_at', asc: false }] },
  {
    key: 'likes',
    label: '좋아요순',
    orders: [
      { column: 'likes_count', asc: false },
      { column: 'created_at', asc: false },
    ],
  },
  {
    key: 'plays',
    label: '게임횟수순',
    orders: [
      { column: 'play_count', asc: false },
      { column: 'created_at', asc: false },
    ],
  },
]

export const DEFAULT_SORT_KEY = 'latest'
export const METRIC_SORT_KEYS = new Set(['likes', 'plays'])

export function getSortOptions({ includeMetrics = true } = {}) {
  if (includeMetrics) return SORT_OPTIONS
  return SORT_OPTIONS.filter((option) => !METRIC_SORT_KEYS.has(option.key))
}

export const MAX_GAME_ROWS = 40
//
