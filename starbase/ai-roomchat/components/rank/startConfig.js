export function readStoredStartConfig() {
  if (typeof window === 'undefined') {
    return { apiKey: '', apiVersion: 'gemini' }
  }
  let apiKey = ''
  let apiVersion = 'gemini'
  try {
    apiKey = (window.sessionStorage.getItem('rank.start.apiKey') || '').trim()
    apiVersion = window.sessionStorage.getItem('rank.start.apiVersion') || 'gemini'
  } catch (error) {
    console.warn('시작 설정을 불러오지 못했습니다:', error)
  }
  return { apiKey, apiVersion }
}
