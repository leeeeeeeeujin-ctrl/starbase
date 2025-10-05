// lib/modelClient.js

function ellipsize(text, max = 120) {
  if (!text) return ''
  const trimmed = String(text).trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function makeCallModel({ getKey }) {
  return async function callModel({ system = '', userText = '' } = {}) {
    const apiKey = typeof getKey === 'function' ? getKey() : null
    if (!apiKey) {
      return { ok: false, error: '운영 키가 필요합니다.' }
    }

    const payload = String(userText || '').trim()
    if (!payload) {
      return { ok: false, error: '전달할 프롬프트가 비어 있습니다.' }
    }

    const preview = ellipsize(payload.replace(/\s+/g, ' '), 80)
    const systemPreview = ellipsize(system.replace(/\s+/g, ' '), 60)

    const stubLines = [
      `AI 응답(스텁): ${preview}`,
      '',
      systemPreview ? `규칙 요약: ${systemPreview}` : '규칙 요약: (없음)',
      '-------------------',
      '',
      '',
      '',
      '',
      '',
      'none',
      '무',
    ]

    const text = stubLines.join('\n')

    return {
      ok: true,
      text,
      tokenUsed: text.length,
      finishReason: 'stubbed',
      meta: {
        preview,
        systemPreview,
      },
    }
  }
}
