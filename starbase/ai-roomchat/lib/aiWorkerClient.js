// lib/aiWorkerClient.js
// AI Worker Pool과의 통신을 담당하는 클라이언트

/**
 * AI Worker Pool에 게임 생성 요청을 보냅니다
 * @param {string} userPrompt - 사용자가 입력한 게임 설명
 * @returns {Promise<Object>} AI가 생성한 게임 데이터
 */
export async function generateGameWithAI(userPrompt) {
  try {
    // 1. 내부 API 엔드포인트로 먼저 시도
    const response = await fetch('/api/ai-workers/generate-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: userPrompt,
        type: 'game-generation'
      })
    })

    if (response.ok) {
      const result = await response.json()
      console.log('✅ 내부 AI API로 게임 생성 성공:', result)
      return result
    }

    // 2. 내부 API 실패시 외부 AI Worker Pool Extension 호출 시도
    console.warn('내부 AI API 실패, 외부 AI Worker Pool Extension 시도...')
    
    // VS Code Extension과 통신 (window.postMessage 방식)
    if (typeof window !== 'undefined' && window.vscode) {
      return new Promise((resolve, reject) => {
        const messageId = Date.now().toString()
        
        // 응답 리스너 등록
        const responseHandler = (event) => {
          if (event.data.id === messageId) {
            window.removeEventListener('message', responseHandler)
            if (event.data.success) {
              resolve(event.data.result)
            } else {
              reject(new Error(event.data.error || 'AI Worker Pool Extension 오류'))
            }
          }
        }
        
        window.addEventListener('message', responseHandler)
        
        // AI Worker Pool Extension에 메시지 전송
        window.vscode.postMessage({
          id: messageId,
          command: 'generateGame',
          prompt: userPrompt
        })
        
        // 5초 타임아웃
        setTimeout(() => {
          window.removeEventListener('message', responseHandler)
          reject(new Error('AI Worker Pool Extension 응답 타임아웃'))
        }, 5000)
      })
    }

    // 3. 모든 방법 실패시 로컬 생성으로 대체
    throw new Error('AI Worker Pool을 사용할 수 없습니다')

  } catch (error) {
    console.warn('AI Worker Pool 연결 실패:', error.message)
    
    // 로컬 대체 로직
    return generateLocalGame(userPrompt)
  }
}

/**
 * AI Worker Pool 연결 실패시 로컬에서 게임을 생성합니다
 * @param {string} userPrompt - 사용자 프롬프트
 * @returns {Object} 로컬에서 생성한 게임 데이터
 */
function generateLocalGame(userPrompt) {
  console.log('🔄 로컬 AI로 게임 생성 중...')
  
  // 키워드 기반 게임 생성
  const keywords = userPrompt.toLowerCase()
  let gameTemplate

  if (keywords.includes('중세') || keywords.includes('기사') || keywords.includes('용')) {
    gameTemplate = {
      gameName: '중세 기사의 모험',
      gameNodes: [
        {
          type: 'ai',
          template: '당신은 중세 시대의 용맹한 기사입니다. 어둠의 세력으로부터 왕국을 구해야 합니다. 🏰⚔️\n\n현재 당신은 고대 성의 입구 앞에 서 있습니다. 성 안에서는 불길한 기운이 느껴지며, 멀리서 용의 울음소리가 들려옵니다.\n\n무엇을 하시겠습니까?'
        },
        {
          type: 'user_action',
          template: '행동을 선택하세요:\n• 🚪 성문을 조심스럽게 열고 들어간다\n• ⚔️ 검을 뽑고 당당하게 입장한다\n• 🛡️ 방패를 들고 경계하며 진입한다\n• 🔍 성 주변을 먼저 살펴본다'
        },
        {
          type: 'system',
          template: '🎲 전투 시스템:\n• 기사 HP: 100\n• 공격력: 20 (검) + 15 (방패)\n• 특수 능력: 성기사의 축복 (HP 50% 이하일 때 공격력 +10)\n\n🏰 현재 위치: 고대 성 입구\n⚠️ 위험도: 중간\n💰 소지금: 50골드'
        }
      ]
    }
  } else if (keywords.includes('우주') || keywords.includes('외계인') || keywords.includes('로봇')) {
    gameTemplate = {
      gameName: '은하계 전쟁',
      gameNodes: [
        {
          type: 'ai',
          template: '🚀 서기 2387년, 당신은 은하연방의 최정예 파일럿입니다. 외계 종족 "제론"이 지구를 침공하기 시작했고, 인류의 운명이 당신의 손에 달려있습니다.\n\n당신의 우주선 "스타호크"는 최신 장비로 무장하고 있으며, 적의 모함이 화성 궤도에 나타났다는 긴급 보고가 들어왔습니다.\n\n사령부에서 명령을 기다리고 있습니다.'
        },
        {
          type: 'user_action',
          template: '작전을 선택하세요:\n• 🚀 즉시 출격하여 정면 공격\n• 🛰️ 스텔스 모드로 은밀히 접근\n• 📡 먼저 정찰을 통해 적 정보 수집\n• 🤝 다른 파일럿들과 팀을 구성'
        },
        {
          type: 'system',
          template: '🛸 우주선 상태:\n• 스타호크 HP: 150\n• 레이저 캐논: 25 데미지\n• 플라즈마 미사일: 40 데미지 (3발 보유)\n• 실드 에너지: 100%\n\n👽 적 정보: 제론 전함 1대, 전투기 5대 확인\n⚡ 연료: 85%'
        }
      ]
    }
  } else if (keywords.includes('좀비') || keywords.includes('생존') || keywords.includes('아포칼립스')) {
    gameTemplate = {
      gameName: '좀비 아포칼립스 생존기',
      gameNodes: [
        {
          type: 'ai',
          template: '🧟 바이러스가 전 세계를 휩쓸고 지나간 지 3개월. 당신은 도시의 폐허에서 혼자 살아남은 생존자입니다.\n\n오늘 아침, 무전기에서 희미한 신호가 들려왔습니다. "여기는... 안전지대... 38번 도로... 도움이..." 그리고 침묵.\n\n당신의 은신처인 아파트 옥상에서 멀리 연기가 피어오르는 것이 보입니다. 살아있는 다른 사람들일까요?'
        },
        {
          type: 'user_action',
          template: '행동을 선택하세요:\n• 🎒 장비를 챙기고 연기가 나는 곳으로 이동\n• 📻 무전기로 응답 신호를 보내본다\n• 🏠 안전지대까지 가는 루트를 계획한다\n• 🔍 주변을 정찰하고 상황을 파악한다'
        },
        {
          type: 'system',
          template: '🎒 인벤토리:\n• 생존자 HP: 80\n• 야구방망이 (근접무기)\n• 권총 + 탄약 12발\n• 통조림 5개, 물 2리터\n• 구급상자, 손전등\n\n🧟 위협 레벨: 보통\n📍 현재 위치: 아파트 옥상 (5층)\n⏰ 시간: 오전 10시 (일광 충분)'
        }
      ]
    }
  } else {
    // 범용 어드벤처 게임
    gameTemplate = {
      gameName: '신비로운 모험',
      gameNodes: [
        {
          type: 'ai',
          template: `"${userPrompt}"을 주제로 한 흥미진진한 모험이 시작됩니다! ✨\n\n당신은 특별한 능력을 가진 모험가입니다. 운명이 당신을 이끄는 곳은 신비로운 세계의 입구입니다.\n\n무엇을 하시겠습니까?`
        },
        {
          type: 'user_action',
          template: '첫 번째 선택을 하세요:\n• 🚀 모험을 시작한다\n• 🎒 장비를 점검한다\n• 📚 상황을 분석한다\n• 🤔 계획을 세운다'
        },
        {
          type: 'system',
          template: '🎮 게임 시작!\n• 플레이어 레벨: 1\n• HP: 100\n• 경험치: 0/100\n• 특수 능력: 미확인\n\n🌟 모험이 기다리고 있습니다!'
        }
      ]
    }
  }

  return {
    success: true,
    source: 'local',
    ...gameTemplate
  }
}

/**
 * AI Worker Pool 연결 상태를 확인합니다
 * @returns {Promise<boolean>} 연결 가능 여부
 */
export async function checkAIWorkerPoolConnection() {
  try {
    const response = await fetch('/api/ai-workers/health', {
      method: 'GET',
      timeout: 2000
    })
    
    return response.ok
  } catch (error) {
    console.warn('AI Worker Pool 연결 확인 실패:', error.message)
    return false
  }
}

export default {
  generateGameWithAI,
  checkAIWorkerPoolConnection
}