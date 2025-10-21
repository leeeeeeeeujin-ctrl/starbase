// pages/api/ai-workers/generate-game.js
// 스타베이스 AI 게임 생성 API (AI Worker Pool 호환)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt, task, context } = req.body

  try {
    console.log(`🤖 AI 게임 생성 요청: "${prompt}"`)

    // AI 게임 생성 로직 (OpenAI API 호출 시뮬레이션)
    const gameResult = await generateGameFromPrompt(prompt)

    res.status(200).json({
      success: true,
      gameName: gameResult.gameName,
      gameNodes: gameResult.gameNodes,
      theme: gameResult.theme,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('AI 게임 생성 실패:', error)
    res.status(500).json({ 
      error: 'AI 게임 생성에 실패했습니다.', 
      details: error.message 
    })
  }
}

/**
 * 자연어 프롬프트로부터 게임 생성
 */
async function generateGameFromPrompt(prompt) {
  // 게임 테마 분석
  const theme = analyzeGameTheme(prompt)
  
  // 테마별 게임 노드 생성
  const gameNodes = await createGameNodes(theme, prompt)
  
  // 게임 이름 생성
  const gameName = generateGameName(theme, prompt)

  return {
    gameName,
    gameNodes,
    theme,
    generatedAt: new Date().toISOString()
  }
}

/**
 * 게임 테마 분석
 */
function analyzeGameTheme(prompt) {
  const lowerPrompt = prompt.toLowerCase()
  
  if (lowerPrompt.includes('중세') || lowerPrompt.includes('기사') || lowerPrompt.includes('용') || lowerPrompt.includes('마법')) {
    return 'medieval-fantasy'
  }
  
  if (lowerPrompt.includes('우주') || lowerPrompt.includes('외계인') || lowerPrompt.includes('로봇') || lowerPrompt.includes('sf')) {
    return 'sci-fi'
  }
  
  if (lowerPrompt.includes('좀비') || lowerPrompt.includes('생존') || lowerPrompt.includes('아포칼립스')) {
    return 'survival-horror'
  }
  
  if (lowerPrompt.includes('현대') || lowerPrompt.includes('도시') || lowerPrompt.includes('범죄') || lowerPrompt.includes('경찰')) {
    return 'modern-action'
  }
  
  if (lowerPrompt.includes('판타지') || lowerPrompt.includes('모험') || lowerPrompt.includes('던전')) {
    return 'fantasy-adventure'
  }
  
  return 'generic-adventure'
}

/**
 * 테마별 게임 노드 생성
 */
async function createGameNodes(theme, prompt) {
  const gameTemplates = {
    'medieval-fantasy': [
      {
        type: 'ai',
        template: '당신은 중세 판타지 세계의 용맹한 모험가입니다. 마법과 검술을 자유롭게 사용할 수 있으며, 정의를 위해 싸웁니다. 당신의 목표는 고대 용을 처치하고 왕국을 구하는 것입니다.'
      },
      {
        type: 'user_action', 
        template: '어떤 행동을 하시겠습니까? 선택지: [⚔️ 공격] [🛡️ 방어] [🔮 마법시전] [🏃 회피] [💬 대화시도]'
      },
      {
        type: 'system',
        template: '🐉 고대 드래곤이 나타났습니다!\n━━━━━━━━━━━━━━━━━━\n🔥 드래곤 HP: 150/150\n⚡ 마나: 100/100\n🏰 위치: 고대 성의 왕좌의 방\n━━━━━━━━━━━━━━━━━━\n드래곤이 불꽃을 내뿜을 준비를 합니다!'
      }
    ],
    
    'sci-fi': [
      {
        type: 'ai',
        template: '당신은 2157년 우주 연방의 엘리트 파일럿입니다. 최첨단 우주선을 조종하며 은하계를 지키는 임무를 수행합니다. 외계 침입자들이 지구를 위협하고 있습니다.'
      },
      {
        type: 'user_action',
        template: '전투 명령을 내리세요: [🚀 레이저 발사] [🛡️ 실드 활성화] [⚡ 플라즈마 미사일] [🔧 시스템 수리] [📡 스캔]'
      },
      {
        type: 'system', 
        template: '👽 외계인 모함이 접근 중!\n━━━━━━━━━━━━━━━━━━\n🛸 적 모함 HP: 200/200\n⚡ 우주선 에너지: 100/100\n📍 위치: 화성 궤도\n━━━━━━━━━━━━━━━━━━\n경고: 적이 차징 빔을 준비하고 있습니다!'
      }
    ],
    
    'survival-horror': [
      {
        type: 'ai',
        template: '좀비 아포칼립스가 시작된 지 30일이 지났습니다. 당신은 몇 안 되는 생존자 중 하나입니다. 제한된 자원으로 살아남고, 다른 생존자들을 구해야 합니다.'
      },
      {
        type: 'user_action',
        template: '생존 행동을 선택하세요: [🔍 수색] [🔨 바리케이드 구축] [💊 치료] [🥫 자원 수집] [👥 생존자 구조]'
      },
      {
        type: 'system',
        template: '🧟 좀비 무리 접근 중!\n━━━━━━━━━━━━━━━━━━\n❤️ 생존자 HP: 85/100\n🥫 식량: 3일분\n💊 의료용품: 2개\n🔫 탄약: 12발\n━━━━━━━━━━━━━━━━━━\n⚠️ 15마리의 좀비가 500m 거리에 있습니다!'
      }
    ],

    'generic-adventure': [
      {
        type: 'ai',
        template: `${prompt}을 주제로 한 흥미진진한 모험이 시작됩니다! 당신은 이 세계의 주인공이 되어 다양한 도전과 모험을 겪게 됩니다.`
      },
      {
        type: 'user_action',
        template: '어떤 행동을 하시겠습니까? [🎯 행동1] [🔍 탐색] [💬 대화] [⚡ 특별행동] [🤔 생각하기]'
      },
      {
        type: 'system',
        template: '🌟 모험이 시작되었습니다!\n━━━━━━━━━━━━━━━━━━\n❤️ 체력: 100/100\n✨ 경험치: 0/100\n🎒 인벤토리: 비어있음\n━━━━━━━━━━━━━━━━━━\n새로운 세계가 당신을 기다리고 있습니다!'
      }
    ]
  }

  return gameTemplates[theme] || gameTemplates['generic-adventure']
}

/**
 * 게임 이름 생성
 */
function generateGameName(theme, prompt) {
  const gameNames = {
    'medieval-fantasy': [
      '드래곤 슬레이어의 전설',
      '마법사의 모험',
      '기사단의 영광',
      '고대 마법의 비밀'
    ],
    'sci-fi': [
      '우주 전쟁: 지구의 마지막 희망', 
      '은하계 수호자',
      '스타 파일럿의 귀환',
      '외계 침입자와의 전쟁'
    ],
    'survival-horror': [
      '좀비 아포칼립스: 생존자',
      '마지막 30일',
      '데드 시티 탈출',
      '생존의 법칙'
    ],
    'generic-adventure': [
      '무한 모험의 시작',
      '새로운 세계 탐험',
      '운명의 여행',
      '전설의 시작'
    ]
  }

  const names = gameNames[theme] || gameNames['generic-adventure']
  return names[Math.floor(Math.random() * names.length)]
}