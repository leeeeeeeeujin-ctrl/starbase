import {
  interpretPromptNode,
  buildParticipantSlotMap,
  DEFAULT_RULE_GUIDANCE,
} from '@/lib/rank/promptInterpreter'

describe('promptInterpreter', () => {
  const baseGame = {
    rules_prefix: '게임 진행 전 반드시 체크할 것.',
    rules: {
      nerf_insight: true,
      fair_power_balance: true,
      ban_kindness: false,
      options: { nerf_peace: { enabled: false } },
      char_limit: 300,
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
    var_rules_global: {
      manual: [{ variable: 'FIRE_GUARD', condition: '화염 장벽을 유지 중일 때.' }],
      active: [{ variable: 'CONTROL', directive: '군중 제어를 우선하라.', condition: '' }],
    },
    var_rules_local: {
      manual: [{ variable: 'LOCAL_CHECK', condition: '특수 조건 충족.' }],
      active: [{ variable: 'LOCAL_ONLY', directive: '이 슬롯만의 경고를 추가하라.' }],
    },
  }

  it('interprets prompt with rules and variables', () => {
    const result = interpretPromptNode({ game: baseGame, node, participants: [participant] })
    expect(result.promptBody).toContain('용사 아린')
    expect(result.promptBody).toContain('전투를 준비한다')
    expect(result.rulesBlock).toContain('[규칙]')
    expect(result.rulesBlock).toContain('게임 진행 전 반드시 체크할 것.')
    expect(result.rulesBlock).toContain('플레이어는 서로 협력해 위기를 해결하라.')
    expect(result.rulesBlock).toContain('분석/통찰은 조건이 모호하면 실패로 처리하라')
    expect(result.rulesBlock).toContain('능력은 여건이 될 때만 사용하되')
    expect(result.rulesBlock).toContain('글을 300자로 써라')
    expect(result.rulesBlock).not.toContain('약자 배려 금지')
    expect(result.rulesBlock).toContain(DEFAULT_RULE_GUIDANCE[0])
    expect(result.rulesBlock).toContain('전역 변수 지침')
    expect(result.rulesBlock).toContain('전역 변수 FIRE_GUARD')
    expect(result.rulesBlock).toContain('로컬 변수 지침')
    expect(result.rulesBlock).toContain('[전역 변수 상태]')
    expect(result.rulesBlock).toContain('활성화된 전역 변수: none')
    expect(result.rulesBlock).toContain('[로컬 변수 상태]')
    expect(result.rulesBlock).toContain('활성화된 로컬 변수: none')
    expect(result.text).toContain('-------------------------------------')
  })

  it('includes active variable state summaries when provided', () => {
    const result = interpretPromptNode({
      game: baseGame,
      node,
      participants: [participant],
      activeGlobalNames: ['FIRE_GUARD', 'CONTROL'],
      activeLocalNames: ['LOCAL_ONLY'],
    })

    expect(result.rulesBlock).toContain('[전역 변수 상태]')
    expect(result.rulesBlock).toContain('활성화된 전역 변수: FIRE_GUARD, CONTROL')
    expect(result.rulesBlock).toContain('[로컬 변수 상태]')
    expect(result.rulesBlock).toContain('활성화된 로컬 변수: LOCAL_ONLY')
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

  it('maps one-based slot placeholders to zero-based participants without duplication', () => {
    const participants = [
      participant,
      {
        ...participant,
        slot_no: 1,
        hero_id: 'hero-2',
        hero: {
          id: 'hero-2',
          name: '수호자 벨라',
          description: '방패를 드는 수호 기사',
        },
      },
    ]
    const slotsMap = buildParticipantSlotMap(participants)
    const nodeWithSlots = {
      id: 'slot-lookup',
      slot_no: 0,
      slot_type: 'ai',
      template: '{{slot1.name}} vs {{slot2.name}} / zero {{slot0.name}}',
    }

    const result = interpretPromptNode({ game: baseGame, node: nodeWithSlots, slotsMap })
    expect(result.promptBody).toContain('용사 아린 vs 수호자 벨라')
    expect(result.promptBody).toContain('zero 용사 아린')
  })

  it('omits default formatting guidance when checklist already covers it', () => {
    const gameWithChecklistFormatting = {
      ...baseGame,
      rules_prefix: '',
      rules: {
        checklist: [
          { text: '마지막 줄=승패, 마지막 둘째줄=변수명들, 마지막 5줄=공백.' },
        ],
      },
    }

    const result = interpretPromptNode({
      game: gameWithChecklistFormatting,
      node,
      participants: [participant],
    })

    expect(result.rulesBlock).not.toContain(DEFAULT_RULE_GUIDANCE[0])
    expect(result.rulesBlock).not.toContain(DEFAULT_RULE_GUIDANCE[1])
    expect(result.rulesBlock).not.toContain(DEFAULT_RULE_GUIDANCE[3])
    expect(result.rulesBlock).toContain('마지막 줄=승패, 마지막 둘째줄=변수명들, 마지막 5줄=공백.')
  })

  it('prefers toggle-provided rules over duplicate base guidance', () => {
    const fairnessLine =
      '- 능력은 여건이 될 때만 사용하되, 상시발동 능력은 제약 없이 가능하다.'
    const gameWithDuplicate = {
      ...baseGame,
      rules_prefix: `${fairnessLine}\n- 추가 규칙: 테스트`,
      rules: {
        ...baseGame.rules,
        fair_power_balance: true,
      },
    }

    const result = interpretPromptNode({
      game: gameWithDuplicate,
      node,
      participants: [participant],
    })

    const occurrences = result.rulesBlock.split(fairnessLine).length - 1
    expect(occurrences).toBe(1)
    expect(result.rulesBlock).toContain('- 추가 규칙: 테스트')
  })
})

