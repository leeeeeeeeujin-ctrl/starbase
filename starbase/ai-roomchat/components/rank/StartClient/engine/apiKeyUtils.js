import { getCooldownDurationMs } from '../../../../lib/rank/apiKeyCooldown'

export function formatDuration(ms) {
  const numeric = Number(ms)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '잠시'
  }
  const totalSeconds = Math.floor(numeric / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []
  if (hours > 0) {
    parts.push(`${hours}시간`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}분`)
  }
  if (parts.length === 0) {
    parts.push(`${Math.max(seconds, 1)}초`)
  }
  return parts.join(' ')
}

export function formatCooldownMessage(info) {
  if (!info?.active) return ''
  const duration = formatDuration(info.remainingMs ?? getCooldownDurationMs())
  const sample = info.keySample ? ` (${info.keySample})` : ''
  const reason = info.reason === 'quota_exhausted' ? 'API 한도가 모두 소진되었습니다.' : ''
  const detail = reason ? `${reason} ` : ''
  return `${detail}최근 사용한 API 키${sample}는 ${duration} 동안 사용할 수 없습니다. 새 키를 입력하거나 쿨다운이 끝난 뒤 다시 시도해 주세요.`
}

export function buildKeySample(value) {
  if (!value) return ''
  if (value.length <= 6) return value
  return `${value.slice(0, 3)}…${value.slice(-2)}`
}

export function isApiKeyError(error) {
  if (!error) return false
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : ''
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  const combined = `${code} ${message}`
  if (!combined.trim()) return false
  const keywords = [
    'missing_user_api_key',
    'quota_exhausted',
    'invalid_api_key',
    'api key',
    'api-key',
    'apikey',
    'api키',
    '키가 만료',
    '키가 없습니다',
  ]
  return keywords.some((keyword) => combined.includes(keyword))
}
