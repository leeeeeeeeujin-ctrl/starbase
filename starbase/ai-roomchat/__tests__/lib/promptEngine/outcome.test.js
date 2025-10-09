import { parseOutcome } from '@/lib/promptEngine/outcome'

describe('promptEngine/parseOutcome', () => {
  it('ignores trailing empty lines when reading outcome metadata', () => {
    const assistantText = [
      '첫 번째 문단',
      '두 번째 문단',
      '',
      '',
      '',
      '',
      '',
      '하이라이트 케릭',
      'VAR_ONE VAR_TWO',
      '케릭 승리',
      '',
      '',
    ].join('\n')

    const result = parseOutcome(assistantText)

    expect(result.lastLine).toBe('케릭 승리')
    expect(result.variables).toEqual(['VAR_ONE', 'VAR_TWO'])
    expect(result.actors).toEqual(['하이라이트', '케릭'])
  })

  it('keeps blank actor or variable lines intact', () => {
    const assistantText = [
      '내용',
      '다음 줄',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '   ',
      '',
      '무',
      '',
    ].join('\n')

    const result = parseOutcome(assistantText)

    expect(result.lastLine).toBe('무')
    expect(result.variables).toEqual([])
    expect(result.actors).toEqual([])
  })

  it('parses variable tokens separated by punctuation and deduplicates them', () => {
    const assistantText = [
      '본문',
      '추가',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '하이라이트 없음',
      'alpha, beta / gamma · Alpha',
      '케릭 승리',
    ].join('\n')

    const result = parseOutcome(assistantText)

    expect(result.variables).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('cleans actor names with comma-separated values and removes duplicates', () => {
    const assistantText = [
      '서사',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '주역: 철수, 영희 / 철수',
      '무',
      '철수 승리',
    ].join('\n')

    const result = parseOutcome(assistantText)

    expect(result.actors).toEqual(['철수', '영희'])
  })
})
