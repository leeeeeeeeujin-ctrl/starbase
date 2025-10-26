// pages/api/ai-workers/code-assistant.js
// 🤖 AI 코드 개발 도우미 API

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, language, currentCode, context, prompt, userApiConfig } = req.body;

    // 사용자 API 설정 검증
    if (!userApiConfig) {
      return res.status(400).json({
        success: false,
        error: 'AI API 설정이 필요합니다',
        needsApiSetup: true,
      });
    }

    // AI 응답 생성 로직
    const aiResponse = await generateAICodeAssistance({
      userMessage: message,
      programmingLanguage: language,
      existingCode: currentCode,
      gameContext: context,
      systemPrompt: prompt,
      userApiConfig: userApiConfig,
    });

    res.status(200).json({
      success: true,
      message: aiResponse.message,
      code: aiResponse.code,
      suggestions: aiResponse.suggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI 코드 도우미 오류:', error);
    res.status(500).json({
      success: false,
      error: '코드 도우미 처리 중 오류가 발생했습니다',
    });
  }
}

// 🎯 AI 코드 도우미 메인 로직
async function generateAICodeAssistance({
  userMessage,
  programmingLanguage,
  existingCode,
  gameContext,
  systemPrompt,
  userApiConfig,
}) {
  // 🔍 메시지 분석
  const intent = analyzeUserIntent(userMessage);

  // 📚 언어별 전문 지식 베이스
  const knowledgeBase = getLanguageKnowledgeBase(programmingLanguage);

  // 🎮 게임 개발 패턴 매칭
  const gamePatterns = matchGameDevelopmentPatterns(userMessage, existingCode);

  try {
    // 사용자 설정 API 우선 사용
    if (userApiConfig && userApiConfig.apiKey) {
      return await callExternalAI({
        userMessage,
        programmingLanguage,
        existingCode,
        gameContext,
        systemPrompt,
        intent,
        knowledgeBase,
        gamePatterns,
        userApiConfig,
      });
    }

    // 로컬 AI 응답 (사용자 API 없을 때)
    return generateLocalAIResponse({
      userMessage,
      programmingLanguage,
      existingCode,
      intent,
      knowledgeBase,
      gamePatterns,
    });
  } catch (error) {
    console.error('AI 응답 생성 실패:', error);

    // API 오류 시 로컬 응답으로 폴백
    return generateLocalAIResponse({
      userMessage,
      programmingLanguage,
      existingCode,
      intent,
      knowledgeBase,
      gamePatterns,
      errorContext: error.message,
    });
  }
}

// 🧠 사용자 의도 분석
function analyzeUserIntent(message) {
  const patterns = {
    code_generation: /(?:만들어|생성|작성|구현).*(?:코드|함수|클래스|로직)/i,
    bug_fix: /(?:버그|오류|에러|문제|고쳐|수정)/i,
    optimization: /(?:최적화|개선|성능|빠르게|효율)/i,
    explanation: /(?:설명|이해|무엇|어떻게|왜|원리)/i,
    feature_add: /(?:추가|기능|새로운|더|확장)/i,
    refactor: /(?:리팩토링|정리|구조|재구성|클린)/i,
    testing: /(?:테스트|검증|확인|시험)/i,
    documentation: /(?:문서|주석|설명|가이드)/i,
  };

  for (const [intent, pattern] of Object.entries(patterns)) {
    if (pattern.test(message)) {
      return intent;
    }
  }

  return 'general_help';
}

// 📚 언어별 전문 지식 베이스
function getLanguageKnowledgeBase(language) {
  const knowledgeBases = {
    javascript: {
      gamePatterns: [
        'game loop implementation',
        'player state management',
        'real-time event handling',
        'WebSocket multiplayer',
        'Canvas rendering',
        'performance optimization',
      ],
      commonIssues: [
        'async/await in game loops',
        'memory leaks in animations',
        'state synchronization',
        'event listener cleanup',
      ],
      bestPractices: [
        'use requestAnimationFrame for smooth animations',
        'implement object pooling for performance',
        'use Web Workers for heavy computations',
        'debounce rapid user inputs',
      ],
    },
    python: {
      gamePatterns: [
        'object-oriented game design',
        'dataclass for game entities',
        'type hints for maintainability',
        'asyncio for concurrent operations',
        'logging for debugging',
        'unit testing with pytest',
      ],
      commonIssues: [
        'mutable default arguments',
        'circular imports in game modules',
        'performance in nested loops',
        'memory usage with large datasets',
      ],
      bestPractices: [
        'use dataclasses for clean entity definitions',
        'implement proper error handling',
        'use context managers for resource management',
        'profile code for performance bottlenecks',
      ],
    },
    sql: {
      gamePatterns: [
        'player data normalization',
        'game session tracking',
        'real-time leaderboards',
        'transaction safety',
        'indexing for performance',
        'data archival strategies',
      ],
      commonIssues: [
        'N+1 query problems',
        'deadlock in concurrent access',
        'slow queries on large tables',
        'data integrity violations',
      ],
      bestPractices: [
        'use proper indexes on foreign keys',
        'implement connection pooling',
        'use transactions for data consistency',
        'regular backup and maintenance',
      ],
    },
    json: {
      gamePatterns: [
        'configuration management',
        'game balancing parameters',
        'localization data',
        'API response formatting',
        'save game serialization',
        'event data structures',
      ],
      commonIssues: [
        'circular references in objects',
        'large file parsing performance',
        'schema validation errors',
        'encoding issues with special characters',
      ],
      bestPractices: [
        'use JSON Schema for validation',
        'implement proper error handling',
        'consider file size for performance',
        'use consistent naming conventions',
      ],
    },
  };

  return knowledgeBases[language] || knowledgeBases.javascript;
}

// 🎮 게임 개발 패턴 매칭
function matchGameDevelopmentPatterns(message, code) {
  const gamePatterns = {
    player_management: /(?:플레이어|player|유저|캐릭터)/i,
    combat_system: /(?:전투|공격|방어|데미지|combat|attack|defense)/i,
    game_state: /(?:게임.*상태|state|턴|round|게임.*로직)/i,
    multiplayer: /(?:멀티플레이어|실시간|real-time|multiplayer|socket)/i,
    ai_behavior: /(?:AI|인공지능|봇|자동|behavior|intelligent)/i,
    database_design: /(?:데이터베이스|저장|조회|database|query|table)/i,
    performance: /(?:성능|최적화|빠르게|performance|optimization)/i,
    ui_interaction: /(?:UI|인터페이스|버튼|클릭|interface|user)/i,
  };

  const matchedPatterns = [];

  for (const [pattern, regex] of Object.entries(gamePatterns)) {
    if (regex.test(message) || (code && regex.test(code))) {
      matchedPatterns.push(pattern);
    }
  }

  return matchedPatterns;
}

// 🌐 외부 AI API 호출 (사용자 설정 API 사용)
async function callExternalAI({
  userMessage,
  programmingLanguage,
  existingCode,
  gameContext,
  systemPrompt,
  intent,
  knowledgeBase,
  gamePatterns,
  userApiConfig,
}) {
  // 사용자가 설정한 API 구성 확인
  if (!userApiConfig || !userApiConfig.apiKey || !userApiConfig.provider) {
    throw new Error('사용자 API 설정이 필요합니다. AI API 관리에서 API 키를 설정해주세요.');
  }

  const { provider, model, apiKey, endpoint } = userApiConfig;

  // 시스템 프롬프트 구성
  const fullSystemPrompt = `${systemPrompt}

전문 분야: ${programmingLanguage} 게임 개발
사용자 의도: ${intent}
매칭된 게임 패턴: ${gamePatterns.join(', ')}
전문 지식: ${JSON.stringify(knowledgeBase, null, 2)}

응답 형식:
- 명확하고 실행 가능한 조언 제공
- 코드 예시가 필요하면 완전하고 작동하는 코드 제공
- 게임 개발 베스트 프랙티스 고려
- 한국어로 친근하게 응답`;

  const userContent = `현재 코드:
\`\`\`${programmingLanguage}
${existingCode}
\`\`\`

게임 컨텍스트: ${JSON.stringify(gameContext, null, 2)}

질문/요청: ${userMessage}`;

  let response, data;

  try {
    // 제공업체별 API 호출
    switch (provider) {
      case 'openai':
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: fullSystemPrompt },
              { role: 'user', content: userContent },
            ],
            max_tokens: 2000,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI API 오류: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        const aiMessage = data.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';

        return {
          message: aiMessage,
          code: extractCodeFromResponse(aiMessage),
          suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
        };

      case 'anthropic':
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: `${fullSystemPrompt}\n\n${userContent}` }],
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          throw new Error(`Anthropic API 오류: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        const claudeMessage = data.content[0]?.text || '응답을 생성할 수 없습니다.';

        return {
          message: claudeMessage,
          code: extractCodeFromResponse(claudeMessage),
          suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
        };

      case 'google':
        const googleUrl = `${endpoint}?key=${apiKey}`;
        response = await fetch(googleUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${fullSystemPrompt}\n\n${userContent}` }],
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`Google API 오류: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        const geminiMessage =
          data.candidates[0]?.content?.parts[0]?.text || '응답을 생성할 수 없습니다.';

        return {
          message: geminiMessage,
          code: extractCodeFromResponse(geminiMessage),
          suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
        };

      case 'cohere':
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt: `${fullSystemPrompt}\n\n${userContent}`,
            max_tokens: 2000,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          throw new Error(`Cohere API 오류: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        const cohereMessage = data.generations[0]?.text || '응답을 생성할 수 없습니다.';

        return {
          message: cohereMessage,
          code: extractCodeFromResponse(cohereMessage),
          suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
        };

      case 'local':
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            prompt: `${fullSystemPrompt}\n\n${userContent}`,
            stream: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`로컬 API 오류: ${response.status} ${response.statusText}`);
        }

        data = await response.json();
        const localMessage = data.response || '응답을 생성할 수 없습니다.';

        return {
          message: localMessage,
          code: extractCodeFromResponse(localMessage),
          suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
        };

      default:
        throw new Error(`지원하지 않는 AI 제공업체: ${provider}`);
    }
  } catch (error) {
    console.error(`${provider} API 호출 실패:`, error);
    throw new Error(`AI API 호출 실패: ${error.message}`);
  }
}

// 📝 응답에서 코드 블록 추출
function extractCodeFromResponse(message) {
  // 다양한 코드 블록 형식 지원
  const patterns = [
    /```(?:javascript|js)\n([\s\S]*?)\n```/gi,
    /```(?:python|py)\n([\s\S]*?)\n```/gi,
    /```(?:sql)\n([\s\S]*?)\n```/gi,
    /```(?:json)\n([\s\S]*?)\n```/gi,
    /```\n([\s\S]*?)\n```/gi, // 언어 지정 없는 코드 블록
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1] || match[0].replace(/```[\w]*\n?/g, '').replace(/\n?```/g, '');
    }
  }

  return null;
}

// 🏠 로컬 AI 응답 생성 (외부 API 없을 때)
function generateLocalAIResponse({
  userMessage,
  programmingLanguage,
  existingCode,
  intent,
  knowledgeBase,
  gamePatterns,
}) {
  const responses = {
    javascript: {
      code_generation: {
        message: `🎮 JavaScript 게임 로직을 생성해드릴게요! 

요청하신 기능을 분석한 결과, 다음과 같은 코드 구조를 제안합니다:

✨ **주요 특징:**
- 실시간 게임 상태 관리
- 플레이어 행동 처리 시스템
- 확장 가능한 아키텍처

💡 **최적화 팁:**
- requestAnimationFrame을 사용한 부드러운 애니메이션
- 이벤트 리스너 정리로 메모리 누수 방지
- 상태 불변성 유지로 버그 예방`,

        code: `// 🎮 게임 시스템 구현
class GameSystem {
  constructor(config = {}) {
    this.players = new Map()
    this.gameState = {
      status: 'waiting',
      turn: 0,
      round: 1,
      ...config
    }
    this.eventHandlers = new Map()
    this.gameLoop = null
  }

  // 플레이어 추가
  addPlayer(playerData) {
    const player = {
      id: Date.now() + Math.random(),
      name: playerData.name,
      hp: 100,
      maxHp: 100,
      actions: [],
      ...playerData
    }
    
    this.players.set(player.id, player)
    this.emit('playerJoined', player)
    return player
  }

  // 게임 시작
  startGame() {
    if (this.players.size < 2) {
      throw new Error('최소 2명의 플레이어가 필요합니다')
    }
    
    this.gameState.status = 'active'
    this.gameState.startTime = Date.now()
    
    this.emit('gameStarted', { 
      players: Array.from(this.players.values()),
      gameState: this.gameState 
    })
    
    this.startGameLoop()
  }

  // 게임 루프 시작  
  startGameLoop() {
    const gameStep = () => {
      if (this.gameState.status === 'active') {
        this.processTurn()
        this.gameLoop = requestAnimationFrame(gameStep)
      }
    }
    
    gameStep()
  }

  // 턴 처리
  processTurn() {
    const alivePlayers = Array.from(this.players.values())
      .filter(player => player.hp > 0)
    
    if (alivePlayers.length <= 1) {
      this.endGame(alivePlayers[0])
      return
    }
    
    // 각 플레이어 액션 처리
    alivePlayers.forEach(player => {
      if (player.pendingAction) {
        this.executePlayerAction(player, player.pendingAction)
        player.pendingAction = null
      }
    })
    
    this.gameState.turn++
    this.emit('turnCompleted', {
      turn: this.gameState.turn,
      players: alivePlayers
    })
  }

  // 플레이어 액션 실행
  executePlayerAction(player, action) {
    switch (action.type) {
      case 'attack':
        const target = this.players.get(action.targetId)
        if (target && target.hp > 0) {
          const damage = Math.floor(Math.random() * 20) + player.attack || 10
          target.hp = Math.max(0, target.hp - damage)
          
          this.emit('actionExecuted', {
            type: 'attack',
            attacker: player,
            target: target,
            damage: damage
          })
        }
        break
        
      case 'heal':
        const healing = Math.floor(Math.random() * 15) + 10
        player.hp = Math.min(player.maxHp, player.hp + healing)
        
        this.emit('actionExecuted', {
          type: 'heal',
          player: player,
          healing: healing
        })
        break
        
      case 'defend':
        player.defendUntilTurn = this.gameState.turn + 1
        
        this.emit('actionExecuted', {
          type: 'defend', 
          player: player
        })
        break
    }
  }

  // 게임 종료
  endGame(winner = null) {
    this.gameState.status = 'finished'
    this.gameState.winner = winner
    this.gameState.endTime = Date.now()
    
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop)
      this.gameLoop = null
    }
    
    this.emit('gameEnded', {
      winner: winner,
      duration: this.gameState.endTime - this.gameState.startTime,
      finalState: this.gameState
    })
  }

  // 이벤트 시스템
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }

  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(\`이벤트 핸들러 오류 (\${eventType}):\`, error)
        }
      })
    }
  }

  // 정리
  destroy() {
    if (this.gameLoop) {
      cancelAnimationFrame(this.gameLoop)
    }
    this.eventHandlers.clear()
    this.players.clear()
  }
}

// 🎯 사용 예시
const game = new GameSystem({
  maxPlayers: 4,
  turnDuration: 5000
})

// 이벤트 리스너 등록
game.on('playerJoined', (player) => {
  console.log(\`🎮 \${player.name}님이 게임에 참가했습니다!\`)
})

game.on('actionExecuted', (actionData) => {
  console.log('⚔️ 액션 실행:', actionData)
})

game.on('gameEnded', (result) => {
  console.log(\`🏆 게임 종료! 승자: \${result.winner?.name || '없음'}\`)
})

// 플레이어 추가
const player1 = game.addPlayer({ name: '영웅', attack: 15 })
const player2 = game.addPlayer({ name: 'AI전사', attack: 12 })

// 게임 시작
game.startGame()

// 플레이어 액션 설정 (예시)
setTimeout(() => {
  player1.pendingAction = { type: 'attack', targetId: player2.id }
}, 1000)

return game`,
      },

      bug_fix: {
        message: `🔧 JavaScript 코드의 잠재적 문제점들을 분석해드릴게요!

🐛 **일반적인 JavaScript 게임 개발 버그들:**

1️⃣ **메모리 누수 방지:**
- 이벤트 리스너 정리
- 타이머 해제 
- 순환 참조 제거

2️⃣ **비동기 처리 오류:**
- Promise 체이닝 문제
- async/await 예외 처리
- 콜백 지옥 해결

3️⃣ **상태 관리 문제:**
- 불변성 위반
- 예상치 못한 상태 변경
- 동시성 문제`,

        code: `// 🔧 일반적인 JavaScript 게임 버그 수정 패턴

class BugFreeGameSystem {
  constructor() {
    this.cleanup = [] // 정리 함수들 저장
    this.abortController = new AbortController() // 요청 취소용
  }

  // ✅ 메모리 누수 방지 - 이벤트 리스너 정리
  addEventListenerSafely(element, event, handler) {
    element.addEventListener(event, handler, {
      signal: this.abortController.signal
    })
  }

  // ✅ 타이머 정리
  setTimeoutSafely(callback, delay) {
    const timeoutId = setTimeout(callback, delay)
    this.cleanup.push(() => clearTimeout(timeoutId))
    return timeoutId
  }

  // ✅ 비동기 오류 처리
  async safeApiCall(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal
      })
      
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`)
      }
      
      return await response.json()
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('요청이 취소되었습니다')
        return null
      }
      
      console.error('API 호출 실패:', error)
      throw error
    }
  }

  // ✅ 상태 불변성 유지
  updateGameState(currentState, updates) {
    return {
      ...currentState,
      ...updates,
      // 중첩 객체도 불변성 유지
      players: currentState.players.map(player => 
        updates.playerId === player.id 
          ? { ...player, ...updates.playerData }
          : player
      )
    }
  }

  // ✅ 안전한 DOM 조작
  updateUI(element, content) {
    // XSS 방지를 위한 텍스트만 업데이트
    if (element && element.isConnected) {
      element.textContent = content
    }
  }

  // ✅ 리소스 정리
  destroy() {
    // 모든 이벤트 리스너 제거
    this.abortController.abort()
    
    // 타이머들 정리
    this.cleanup.forEach(cleanupFn => {
      try {
        cleanupFn()
      } catch (error) {
        console.error('정리 중 오류:', error)
      }
    })
    
    this.cleanup = []
  }
}

// 🔍 디버깅 도우미 함수들
const DebugHelper = {
  // 성능 측정
  measure(name, fn) {
    console.time(name)
    const result = fn()
    console.timeEnd(name)
    return result
  },

  // 객체 깊은 비교
  deepEqual(obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2)
  },

  // 메모리 사용량 체크
  checkMemory() {
    if (performance.memory) {
      console.log('메모리 사용량:', {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
      })
    }
  }
}

return { BugFreeGameSystem, DebugHelper }`,
      },
    },

    python: {
      code_generation: {
        message: `🐍 Python으로 강력한 게임 시스템을 구현해드릴게요!

**🎯 구현 특징:**
- 객체지향 설계 패턴
- 타입 힌트로 안전한 코드
- 확장 가능한 아키텍처
- 완벽한 에러 처리

**💡 Python 게임 개발 베스트 프랙티스:**
- dataclass로 깔끔한 엔티티 정의
- asyncio로 동시성 처리
- 로깅으로 디버깅 지원
- 유닛 테스트 포함`,

        code: `# 🎮 Python 게임 엔진 구현
import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional, Callable, Any
from collections import defaultdict

# 🎯 게임 상태 열거형
class GameStatus(Enum):
    WAITING = auto()
    ACTIVE = auto()
    PAUSED = auto()
    FINISHED = auto()

class ActionType(Enum):
    ATTACK = auto()
    DEFEND = auto()
    HEAL = auto()
    SPECIAL = auto()

# 🎮 플레이어 데이터 클래스
@dataclass
class Player:
    id: str
    name: str
    hp: int = 100
    max_hp: int = 100
    attack: int = 15
    defense: int = 10
    magic: int = 5
    level: int = 1
    experience: int = 0
    skills: List[str] = field(default_factory=list)
    status_effects: Dict[str, int] = field(default_factory=dict)
    
    def is_alive(self) -> bool:
        return self.hp > 0
    
    def take_damage(self, damage: int, damage_type: str = "physical") -> int:
        # 방어력 계산
        if damage_type == "physical":
            actual_damage = max(1, damage - self.defense)
        else:  # magical damage
            actual_damage = damage
            
        # 방어 상태 효과 확인
        if "defending" in self.status_effects:
            actual_damage = actual_damage // 2
            
        self.hp = max(0, self.hp - actual_damage)
        return actual_damage
    
    def heal(self, amount: int) -> int:
        old_hp = self.hp
        self.hp = min(self.max_hp, self.hp + amount)
        return self.hp - old_hp
    
    def add_experience(self, exp: int):
        self.experience += exp
        # 레벨업 체크
        while self.experience >= self.level * 100:
            self.experience -= self.level * 100
            self.level_up()
    
    def level_up(self):
        self.level += 1
        self.max_hp += 10
        self.hp = self.max_hp  # 레벨업시 체력 회복
        self.attack += 2
        self.defense += 1
        logging.info(f"{self.name}이(가) 레벨 {self.level}로 상승했습니다!")

# 🎲 게임 액션 데이터
@dataclass
class GameAction:
    player_id: str
    action_type: ActionType
    target_id: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

# 🎯 게임 이벤트 데이터
@dataclass 
class GameEvent:
    event_type: str
    data: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)

# 🏆 게임 엔진 메인 클래스
class GameEngine:
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.players: Dict[str, Player] = {}
        self.game_state = {
            "status": GameStatus.WAITING,
            "turn": 0,
            "round": 1,
            "start_time": None,
            "current_player": None
        }
        
        # 이벤트 시스템
        self.event_handlers: Dict[str, List[Callable]] = defaultdict(list)
        self.event_history: List[GameEvent] = []
        
        # 게임 로그
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
        # 비동기 작업 관리
        self.tasks: List[asyncio.Task] = []
        
    def add_player(self, player_data: Dict[str, Any]) -> Player:
        """플레이어를 게임에 추가"""
        player = Player(
            id=player_data.get("id", f"player_{len(self.players) + 1}"),
            name=player_data["name"],
            **{k: v for k, v in player_data.items() if k not in ["id", "name"]}
        )
        
        self.players[player.id] = player
        self.emit_event("player_joined", {"player": player})
        self.logger.info(f"🎮 {player.name}님이 게임에 참가했습니다!")
        
        return player
    
    def start_game(self) -> bool:
        """게임 시작"""
        if len(self.players) < 2:
            self.logger.error("❌ 최소 2명의 플레이어가 필요합니다")
            return False
            
        self.game_state["status"] = GameStatus.ACTIVE
        self.game_state["start_time"] = time.time()
        self.game_state["current_player"] = list(self.players.keys())[0]
        
        self.emit_event("game_started", {
            "players": list(self.players.values()),
            "game_state": self.game_state
        })
        
        self.logger.info("🚀 게임이 시작되었습니다!")
        return True
    
    async def process_action(self, action: GameAction) -> Dict[str, Any]:
        """플레이어 액션 처리"""
        player = self.players.get(action.player_id)
        if not player or not player.is_alive():
            return {"success": False, "error": "유효하지 않은 플레이어입니다"}
            
        result = {"success": True, "effects": []}
        
        try:
            if action.action_type == ActionType.ATTACK:
                result.update(await self._process_attack(player, action))
            elif action.action_type == ActionType.DEFEND:
                result.update(await self._process_defend(player, action))
            elif action.action_type == ActionType.HEAL:
                result.update(await self._process_heal(player, action))
            elif action.action_type == ActionType.SPECIAL:
                result.update(await self._process_special(player, action))
                
        except Exception as e:
            self.logger.error(f"액션 처리 중 오류: {e}")
            result = {"success": False, "error": str(e)}
        
        # 게임 상태 업데이트
        await self._update_game_state()
        
        return result
    
    async def _process_attack(self, attacker: Player, action: GameAction) -> Dict[str, Any]:
        """공격 액션 처리"""
        target_id = action.target_id
        target = self.players.get(target_id) if target_id else None
        
        if not target or not target.is_alive():
            return {"error": "유효하지 않은 대상입니다"}
            
        # 데미지 계산
        base_damage = attacker.attack + random.randint(-3, 3)
        
        # 크리티컬 체크 (15% 확률)
        is_critical = random.random() < 0.15
        if is_critical:
            base_damage = int(base_damage * 1.5)
            
        # 데미지 적용
        actual_damage = target.take_damage(base_damage)
        
        # 경험치 획득
        attacker.add_experience(5)
        
        result_data = {
            "attacker": attacker.name,
            "target": target.name, 
            "damage": actual_damage,
            "critical": is_critical,
            "target_hp": target.hp
        }
        
        self.emit_event("attack_executed", result_data)
        self.logger.info(f"⚔️ {attacker.name}이(가) {target.name}에게 {actual_damage} 데미지!" + 
                        (" (크리티컬!)" if is_critical else ""))
        
        # 대상이 쓰러졌는지 확인
        if not target.is_alive():
            self.emit_event("player_defeated", {"player": target, "attacker": attacker})
            attacker.add_experience(25)  # 처치 보너스 경험치
            self.logger.info(f"💀 {target.name}이(가) 쓰러졌습니다!")
            
        return result_data
    
    async def _process_defend(self, player: Player, action: GameAction) -> Dict[str, Any]:
        """방어 액션 처리"""
        player.status_effects["defending"] = 2  # 2턴간 방어 상태
        
        result_data = {"player": player.name, "defense_turns": 2}
        self.emit_event("defend_executed", result_data)
        self.logger.info(f"🛡️ {player.name}이(가) 방어 태세를 취했습니다!")
        
        return result_data
    
    async def _process_heal(self, player: Player, action: GameAction) -> Dict[str, Any]:
        """치유 액션 처리"""
        heal_amount = random.randint(15, 25) + (player.magic // 2)
        actual_heal = player.heal(heal_amount)
        
        result_data = {
            "player": player.name,
            "heal_amount": actual_heal,
            "current_hp": player.hp
        }
        
        self.emit_event("heal_executed", result_data)
        self.logger.info(f"✨ {player.name}이(가) {actual_heal} HP를 회복했습니다!")
        
        return result_data
    
    async def _process_special(self, player: Player, action: GameAction) -> Dict[str, Any]:
        """특수 스킬 처리"""
        skill_name = action.data.get("skill", "unknown")
        
        # 스킬별 효과 구현 (확장 가능)
        skill_effects = {
            "fireball": lambda: self._cast_fireball(player, action),
            "lightning": lambda: self._cast_lightning(player, action),
            "blessing": lambda: self._cast_blessing(player, action)
        }
        
        if skill_name in skill_effects:
            return await skill_effects[skill_name]()
        else:
            return {"error": f"알 수 없는 스킬: {skill_name}"}
    
    async def _update_game_state(self):
        """게임 상태 업데이트"""
        alive_players = [p for p in self.players.values() if p.is_alive()]
        
        # 승리 조건 체크
        if len(alive_players) <= 1:
            await self._end_game(alive_players[0] if alive_players else None)
            return
            
        # 상태 효과 업데이트
        for player in self.players.values():
            for effect in list(player.status_effects.keys()):
                player.status_effects[effect] -= 1
                if player.status_effects[effect] <= 0:
                    del player.status_effects[effect]
        
        # 턴 증가
        self.game_state["turn"] += 1
        
        # 다음 플레이어 설정
        current_index = list(self.players.keys()).index(self.game_state["current_player"])
        next_index = (current_index + 1) % len(alive_players)
        if next_index < len(alive_players):
            self.game_state["current_player"] = alive_players[next_index].id
    
    async def _end_game(self, winner: Optional[Player] = None):
        """게임 종료"""
        self.game_state["status"] = GameStatus.FINISHED
        self.game_state["end_time"] = time.time()
        self.game_state["winner"] = winner.id if winner else None
        
        duration = self.game_state["end_time"] - self.game_state["start_time"]
        
        self.emit_event("game_ended", {
            "winner": winner,
            "duration": duration,
            "total_turns": self.game_state["turn"]
        })
        
        if winner:
            winner.add_experience(100)  # 승리 보너스
            self.logger.info(f"🏆 {winner.name}님이 승리했습니다!")
        else:
            self.logger.info("🤝 게임이 무승부로 끝났습니다!")
    
    def emit_event(self, event_type: str, data: Dict[str, Any]):
        """이벤트 발생"""
        event = GameEvent(event_type, data)
        self.event_history.append(event)
        
        # 등록된 핸들러들 실행
        for handler in self.event_handlers[event_type]:
            try:
                handler(event)
            except Exception as e:
                self.logger.error(f"이벤트 핸들러 오류 ({event_type}): {e}")
    
    def on(self, event_type: str, handler: Callable[[GameEvent], None]):
        """이벤트 핸들러 등록"""
        self.event_handlers[event_type].append(handler)
    
    def get_game_status(self) -> Dict[str, Any]:
        """현재 게임 상태 반환"""
        return {
            "game_state": self.game_state,
            "players": {pid: {
                "name": p.name,
                "hp": p.hp,
                "max_hp": p.max_hp,
                "level": p.level,
                "alive": p.is_alive(),
                "status_effects": p.status_effects
            } for pid, p in self.players.items()},
            "recent_events": self.event_history[-10:]  # 최근 10개 이벤트
        }

# 🎯 사용 예시
async def main():
    # 게임 엔진 생성
    engine = GameEngine({"max_players": 4})
    
    # 이벤트 핸들러 등록
    engine.on("attack_executed", lambda event: 
              print(f"🔥 공격 이벤트: {event.data}"))
    
    # 플레이어 추가
    hero = engine.add_player({
        "name": "용감한 영웅",
        "attack": 20,
        "defense": 15,
        "magic": 10
    })
    
    villain = engine.add_player({
        "name": "어둠의 마법사", 
        "attack": 18,
        "defense": 12,
        "magic": 20
    })
    
    # 게임 시작
    engine.start_game()
    
    # 액션 시뮬레이션
    actions = [
        GameAction(hero.id, ActionType.ATTACK, villain.id),
        GameAction(villain.id, ActionType.ATTACK, hero.id),
        GameAction(hero.id, ActionType.HEAL),
        GameAction(villain.id, ActionType.DEFEND)
    ]
    
    for action in actions:
        result = await engine.process_action(action)
        print(f"액션 결과: {result}")
        
        # 게임 상태 확인
        status = engine.get_game_status()
        if status["game_state"]["status"] == GameStatus.FINISHED:
            break
        
        await asyncio.sleep(1)  # 1초 대기

# 실행
if __name__ == "__main__":
    asyncio.run(main())`,
      },
    },
  };

  // 의도와 언어에 따른 응답 선택
  const langResponses = responses[programmingLanguage] || responses.javascript;
  const response = langResponses[intent] || {
    message: `✨ ${programmingLanguage.toUpperCase()} 개발을 도와드릴게요!

🤔 **분석 결과:**
- 프로그래밍 언어: ${programmingLanguage}
- 요청 유형: ${intent}
- 게임 패턴: ${gamePatterns.join(', ') || '일반적인 요청'}

💡 **추천 사항:**
${knowledgeBase.bestPractices
  .slice(0, 3)
  .map(tip => `- ${tip}`)
  .join('\n')}

🚨 **주의사항:**
${knowledgeBase.commonIssues
  .slice(0, 2)
  .map(issue => `- ${issue}`)
  .join('\n')}`,

    code: null,
  };

  return {
    message: response.message,
    code: response.code,
    suggestions: generateSuggestions(intent, gamePatterns, programmingLanguage),
  };
}

// 💡 추가 제안사항 생성
function generateSuggestions(intent, gamePatterns, language) {
  const suggestions = [];

  if (gamePatterns.includes('player_management')) {
    suggestions.push('플레이어 상태 저장/로드 시스템 추가');
    suggestions.push('레벨업 및 스킬 트리 구현');
  }

  if (gamePatterns.includes('combat_system')) {
    suggestions.push('데미지 계산 공식 개선');
    suggestions.push('상태 효과 시스템 추가');
  }

  if (language === 'javascript') {
    suggestions.push('TypeScript로 타입 안전성 향상');
    suggestions.push('Web Worker로 성능 최적화');
  }

  if (language === 'python') {
    suggestions.push('pytest로 유닛 테스트 작성');
    suggestions.push('dataclass 검증 로직 추가');
  }

  return suggestions.slice(0, 3); // 최대 3개까지
}

// 🆘 폴백 응답 (모든 것이 실패했을 때)
function generateFallbackResponse(userMessage, language) {
  return {
    message: `🤖 ${language.toUpperCase()} 개발을 도와드리고 싶지만, 현재 AI 서비스에 일시적인 문제가 있습니다.

💬 **질문:** "${userMessage}"

🛠️ **제안:**
- 구체적인 코드 예시나 오류 메시지를 포함해서 다시 질문해보세요
- 단계별로 나누어서 질문해보세요
- 공식 문서나 커뮤니티 리소스를 참고해보세요

🔄 잠시 후에 다시 시도해주시면 더 나은 답변을 드릴 수 있습니다!`,

    code: null,
    suggestions: [
      '구체적인 에러 메시지 포함하여 질문',
      '단계별로 문제를 나누어 질문',
      '예제 코드와 함께 질문',
    ],
  };
}
