// pages/api/ai-workers/generate-game.js
// AI Worker Pool을 통한 게임 생성 API 엔드포인트

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { prompt, type = 'game-generation' } = req.body

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid prompt' })
    }

    console.log('🎮 게임 생성 요청:', prompt)

    // 실제 AI Worker Pool 연결 시도 (향후 구현)
    // const aiResult = await callAIWorkerPool(prompt)
    
    // 현재는 로컬 생성으로 대체
    const gameResult = generateGameLocally(prompt)
    
    console.log('✅ 게임 생성 완료:', gameResult.gameName)

    return res.status(200).json({
      success: true,
      ...gameResult,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ 게임 생성 실패:', error)
    
    return res.status(500).json({
      success: false,
      error: error.message || '게임 생성 중 오류가 발생했습니다'
    })
  }
}

/**
 * 로컬에서 게임을 생성하는 함수
 */
function generateGameLocally(prompt) {
  const keywords = prompt.toLowerCase()
  
  // 키워드 분석 기반 게임 생성
  if (keywords.includes('중세') || keywords.includes('기사') || keywords.includes('용') || keywords.includes('마법')) {
    return {
      gameName: '중세 판타지 모험',
      description: '용맹한 기사가 되어 용을 물리치고 왕국을 구하는 모험',
      gameNodes: [
        {
          type: 'ai',
          template: '🏰 당신은 아서 왕국의 기사입니다. 악한 용 "블랙드래곤"이 공주를 납치했다는 소식이 들려왔습니다. 왕으로부터 구출 임무를 받은 당신, 어떻게 하시겠습니까?'
        },
        {
          type: 'user_action', 
          template: '행동을 선택하세요:\\n• ⚔️ 즉시 용의 동굴로 향한다\\n• 🛡️ 먼저 더 좋은 장비를 구한다\\n• 🤝 다른 기사들과 팀을 꾸린다\\n• 📚 용에 대한 정보를 수집한다'
        },
        {
          type: 'system',
          template: '⚔️ 기사 스탯:\\n• HP: 100/100\\n• 공격력: 25\\n• 방어력: 20\\n• 마나: 50/50\\n\\n🎒 장비: 철검, 사슬갑옷, 방패\\n💰 소지금: 100 골드'
        }
      ]
    }
  }
  
  if (keywords.includes('우주') || keywords.includes('외계인') || keywords.includes('로봇') || keywords.includes('스타')) {
    return {
      gameName: '스타 크루세이더',
      description: '우주 해적선의 선장이 되어 은하계를 탐험하는 SF 어드벤처',
      gameNodes: [
        {
          type: 'ai',
          template: '🚀 서기 2387년, 당신은 우주선 "스타크루저"의 선장입니다. 신비한 에너지 신호가 미지의 행성에서 포착되었습니다. 이 신호는 전설의 "코스믹 크리스탈"과 관련이 있을 수 있습니다.'
        },
        {
          type: 'user_action',
          template: '선택하세요:\\n• 🛸 즉시 해당 행성으로 워프한다\\n• 🔍 먼저 스캔으로 행성을 조사한다\\n• 📡 다른 우주선과 정보를 공유한다\\n• ⚡ 무기 시스템을 점검한다'
        },
        {
          type: 'system', 
          template: '🛸 우주선 상태:\\n• 선체 HP: 200/200\\n• 에너지: 150/150\\n• 승무원: 5명\\n• 화물칸: 빈 공간 75%\\n\\n⚔️ 무장: 레이저 캐논, 프로톤 어뢰\\n🗺️ 현재 위치: 알파 센타우리 근처'
        }
      ]
    }
  }
  
  if (keywords.includes('좀비') || keywords.includes('생존') || keywords.includes('아포칼립스')) {
    return {
      gameName: '최후의 생존자',
      description: '좀비 아포칼립스에서 살아남아 안전지대를 찾는 서바이벌 게임',
      gameNodes: [
        {
          type: 'ai',
          template: '🧟 바이러스 창궐 후 30일째. 당신은 폐허가 된 도시에서 홀로 생존하고 있습니다. 라디오에서 "안전지대가 북쪽에 있다"는 방송이 들려왔습니다. 하지만 그곳까지 가려면 좀비들이 우글거리는 시가지를 통과해야 합니다.'
        },
        {
          type: 'user_action',
          template: '생존 전략:\\n• 🏃 빠르게 달려서 돌파한다\\n• 🤫 조용히 숨어서 이동한다\\n• 🔥 폭발물로 길을 뚫는다\\n• 🚗 차량을 찾아서 이용한다'
        },
        {
          type: 'system',
          template: '👤 생존자 상태:\\n• HP: 85/100\\n• 스태미나: 70/100\\n• 정신력: 60/100\\n\\n🎒 인벤토리:\\n• 야구방망이, 권총(탄약 8발)\\n• 통조림 3개, 물 1.5L\\n• 구급상자, 손전등'
        }
      ]
    }
  }
  
  // 기본 어드벤처 게임
  return {
    gameName: '신비한 모험',
    description: `"${prompt}"를 테마로 한 특별한 어드벤처 게임`,
    gameNodes: [
      {
        type: 'ai',
        template: `🌟 "${prompt}"의 세계에 오신 것을 환영합니다! 당신은 특별한 운명을 가진 모험가입니다. 신비로운 힘이 당신을 이 곳으로 이끌었습니다. 무엇부터 시작하시겠습니까?`
      },
      {
        type: 'user_action',
        template: '첫 행동을 선택하세요:\\n• 🚀 모험을 시작한다\\n• 🎒 소지품을 확인한다\\n• 🗺️ 주변을 둘러본다\\n• 💭 상황을 정리한다'
      },
      {
        type: 'system',
        template: '🎮 모험가 정보:\\n• 레벨: 1\\n• HP: 100/100\\n• MP: 50/50\\n• 경험치: 0/100\\n\\n✨ 특수 능력: 미각성 상태\\n🎯 목표: 운명을 찾아 여정을 떠나라!'
      }
    ]
  }
}