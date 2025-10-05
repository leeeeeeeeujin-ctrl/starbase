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
})
