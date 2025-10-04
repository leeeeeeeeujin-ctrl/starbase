import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig'

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
