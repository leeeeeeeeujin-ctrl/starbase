import {
  interpretPromptNode,
  buildParticipantSlotMap,
  DEFAULT_RULE_GUIDANCE,
} from '@/lib/rank/promptInterpreter'

describe('promptInterpreter', () => {
  const baseGame = {
    rules_prefix: '게임 진행 전 반드시 체크할 것.',
    rules: {
      checklist: [
        { text: '플레이어는 서로 협력해 위기를 해결하라.', mandatory: true },
        { text: '시네마틱 연출을 중시하라.' },
      ],
    },
  }

  const participant = {
    slot_no: 0,
    role: 'attack',
    status: 'alive',
    owner_id: 'owner-1',
    hero_id: 'hero-1',
    hero: {
      id: 'hero-1',
      name: '용사 아린',
      description: '불꽃을 다루는 모험가',
      ability1: '화염 베기',
      ability2: '용기 강화',
    },
  }

  const node = {
    id: 'slot-0',
    slot_no: 0,
    slot_type: 'ai',
    template: '[[TURN]] {{slot0.name}}이(가) 전투를 준비한다.',
    options: {
      manual_vars_global: [{ name: 'FIRE_GUARD', instruction: '화염 장벽을 세웠다면 활성화.' }],
      manual_vars_local: [{ name: 'LOCAL_CHECK', instruction: '해당 슬롯 특수 조건이 충족되면 활성화.' }],
      active_vars_global: [{ directive: '군중 제어를 우선하라.', name: 'CONTROL' }],
      active_vars_local: [],
    },
  }

  it('interprets prompt with rules and variables', () => {
    const result = interpretPromptNode({ game: baseGame, node, participants: [participant] })
    expect(result.promptBody).toContain('용사 아린')
    expect(result.promptBody).toContain('전투를 준비한다')
    expect(result.rulesBlock).toContain('[규칙]')
    expect(result.rulesBlock).toContain('게임 진행 전 반드시 체크할 것.')
    expect(result.rulesBlock).toContain('플레이어는 서로 협력해 위기를 해결하라.')
    expect(result.rulesBlock).toContain(DEFAULT_RULE_GUIDANCE[0])
    expect(result.rulesBlock).toContain('전역 변수 지침')
    expect(result.rulesBlock).toContain('전역 변수 FIRE_GUARD')
    expect(result.rulesBlock).toContain('로컬 변수 지침')
    expect(result.text).toContain('-------------------------------------')
  })

  it('supports history and pick placeholders while reusing participant maps', () => {
    const slotsMap = buildParticipantSlotMap([participant])
    const randomNode = {
      id: 'slot-1',
      slot_no: 1,
      slot_type: 'ai',
      template: '선택값 {{pick:alpha|beta}} / 이력 {{history}}',
      options: {},
    }
    const historyText = '지난 턴 기록'
    const result = interpretPromptNode({
      game: baseGame,
      node: randomNode,
      slotsMap,
      historyText,
    })
    expect(result.promptBody).not.toContain('{{pick:')
    expect(result.promptBody).toContain(historyText)
    expect(result.promptBody.includes('alpha') || result.promptBody.includes('beta')).toBe(true)
  })
})

