export function formatKoreanDate(value) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatRelativeKorean(value) {
  if (!value) return '기록 없음'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '기록 없음'

  const now = Date.now()
  const diff = now - date.getTime()
  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  if (diff < MINUTE) return '방금 전'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)}일 전`

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

