'use client'

export function formatPlayNumber(value) {
  if (value == null) return '—'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('ko-KR')
  }
  return String(value)
}

export function formatPlayWinRate(summary) {
  if (!summary || summary.rate == null) return '—'
  return `${summary.rate}%`
}

