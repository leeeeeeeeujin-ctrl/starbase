export const NAV_LINKS = [
  { label: '게임 제작', href: '/maker' },
  { label: '플레이', href: '/play' },
  { label: '사설', href: '/private' },
  { label: '랭킹', href: '/rank' },
]

export const LOBBY_TABS = [
  { key: 'chat', label: '공용 채팅' },
  { key: 'games', label: '게임 찾기' },
  { key: 'alerts', label: '알림' },
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

export const MAX_GAME_ROWS = 40
//
