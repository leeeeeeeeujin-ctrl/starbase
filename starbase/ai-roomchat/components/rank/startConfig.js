import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig'

const MATCH_META_KEY = 'rank.start.matchMeta'

function safeClone(value) {
  if (!value || typeof value !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    console.warn('매치 메타데이터를 직렬화하지 못했습니다:', error)
    return null
  }
}

export function buildMatchMetaPayload(match, extras = {}) {
  if (!match || typeof match !== 'object') return null

  const assignmentSummary = Array.isArray(match.assignments)
    ? match.assignments.map((assignment) => ({
        role: typeof assignment?.role === 'string' ? assignment.role.trim() : '',
        members: Array.isArray(assignment?.members) ? assignment.members.length : 0,
      }))
    : []

  const payload = {
    storedAt: Date.now(),
    matchType: typeof match.matchType === 'string' ? match.matchType.trim() : null,
    matchCode: typeof match.matchCode === 'string' ? match.matchCode.trim() : null,
    dropInTarget: safeClone(match.dropInTarget || null),
    dropInMeta: safeClone(match.dropInMeta || null),
    sampleMeta: safeClone(match.sampleMeta || null),
    roleStatus: safeClone(match.roleStatus || null),
    assignments: assignmentSummary,
    ...extras,
  }

  return safeClone(payload)
}

export function storeStartMatchMeta(meta) {
  if (typeof window === 'undefined') return
  if (!meta) {
    window.sessionStorage.removeItem(MATCH_META_KEY)
    return
  }
  const sanitized = safeClone(meta)
  if (!sanitized) {
    window.sessionStorage.removeItem(MATCH_META_KEY)
    return
  }
  try {
    window.sessionStorage.setItem(MATCH_META_KEY, JSON.stringify(sanitized))
  } catch (error) {
    console.warn('매치 메타데이터를 저장하지 못했습니다:', error)
  }
}

export function consumeStartMatchMeta() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(MATCH_META_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(MATCH_META_KEY)
    const parsed = JSON.parse(raw)
    return safeClone(parsed)
  } catch (error) {
    console.warn('매치 메타데이터를 불러오지 못했습니다:', error)
    return null
  }
}

export function readStoredStartConfig() {
  if (typeof window === 'undefined') {
    return {
      apiKey: '',
      apiVersion: 'gemini',
      geminiMode: DEFAULT_GEMINI_MODE,
      geminiModel: DEFAULT_GEMINI_MODEL,
    }
  }
  let apiKey = ''
  let apiVersion = 'gemini'
  let geminiMode = DEFAULT_GEMINI_MODE
  let geminiModel = DEFAULT_GEMINI_MODEL
  try {
    apiKey = (window.sessionStorage.getItem('rank.start.apiKey') || '').trim()
    apiVersion = window.sessionStorage.getItem('rank.start.apiVersion') || 'gemini'
    geminiMode = normalizeGeminiMode(
      window.sessionStorage.getItem('rank.start.geminiMode') || DEFAULT_GEMINI_MODE,
    )
    geminiModel = normalizeGeminiModelId(
      window.sessionStorage.getItem('rank.start.geminiModel') || DEFAULT_GEMINI_MODEL,
    )
    if (!geminiModel) {
      geminiModel = DEFAULT_GEMINI_MODEL
    }
  } catch (error) {
    console.warn('시작 설정을 불러오지 못했습니다:', error)
  }
  return { apiKey, apiVersion, geminiMode, geminiModel }
}
