import { prepareHistoryPayload, sanitizeHistoryForProvider } from '@/lib/rank/chatHistory'

describe('chatHistory utilities', () => {
  const sampleHistory = [
    { role: 'system', content: '첫 번째 프롬프트', idx: 0 },
    { role: 'AI', content: '응답 A', meta: { turnIdx: 1 } },
    { role: 'user', content: '   ' },
    { role: 'player', content: '플레이어 액션', includeInAi: false },
    { role: 'assistant', content: '최신 응답', meta: { turnIdx: '5' } },
  ]

  it('normalizes history entries for request payloads', () => {
    const payload = prepareHistoryPayload(sampleHistory, { limit: 10 })
    expect(payload).toEqual([
      { role: 'user', content: '첫 번째 프롬프트', turnIdx: 0 },
      { role: 'assistant', content: '응답 A', turnIdx: 1 },
      { role: 'assistant', content: '최신 응답', turnIdx: 5 },
    ])
  })

  it('applies limits and matches provider sanitizer output', () => {
    const limited = prepareHistoryPayload(sampleHistory, { limit: 2 })
    expect(limited).toEqual([
      { role: 'assistant', content: '응답 A', turnIdx: 1 },
      { role: 'assistant', content: '최신 응답', turnIdx: 5 },
    ])

    const provider = sanitizeHistoryForProvider(sampleHistory, { limit: 2 })
    expect(provider).toEqual(limited)
  })
})

