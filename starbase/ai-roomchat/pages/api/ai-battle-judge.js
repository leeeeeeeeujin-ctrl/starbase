/**
 * AI 배틀 판정 시스템 API
 *
 * 캐릭터 정보와 액션을 기반으로 AI가 공정하고 흥미진진한 배틀 판정을 내립니다.
 * 게임의 핵심이 되는 AI 심판 로직입니다.
 */

export default async function handler(req, res) {
  // CORS 헤더 추가
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted',
    });
  }

  // 요청 데이터 검증
  const { character, action, turn, gameSettings, previousTurns, prompt, gameState } = req.body;

  if (!character && !prompt) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Character data or prompt is required',
    });
  }

  try {
    let battleResult;

    if (prompt && gameState) {
      // 통합 게임 시스템에서의 호출
      battleResult = await processUnifiedGamePrompt({
        prompt,
        gameState,
        character,
      });
    } else {
      // 기존 배틀 시스템에서의 호출
      battleResult = await processAIBattleJudgment({
        character,
        action,
        turn,
        gameSettings,
        previousTurns,
      });
    }

    res.status(200).json(battleResult);
  } catch (error) {
    console.error('AI 배틀 판정 오류:', error);

    // 에러 타입에 따른 적절한 응답
    const status = error.name === 'ValidationError' ? 400 : 500;
    const message =
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'AI 판정 처리 중 오류가 발생했습니다';

    res.status(status).json({
      error: 'AI processing failed',
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
}

// 통합 게임 시스템용 프롬프트 처리
async function processUnifiedGamePrompt(context) {
  const { prompt, gameState, character } = context;

  try {
    const aiResponse = await callAIJudge(prompt);

    return {
      narrative: aiResponse,
      response: aiResponse,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('통합 게임 프롬프트 처리 오류:', error);

    // 더 나은 폴백 응답
    const characterName = character?.name || '플레이어';
    return {
      narrative: `${characterName}이(가) 잠시 생각에 잠깁니다. 다음에는 어떤 일이 일어날까요?`,
      response: `${characterName}이(가) 잠시 생각에 잠깁니다. 다음에는 어떤 일이 일어날까요?`,
      success: false,
      fallback: true,
      timestamp: new Date().toISOString(),
    };
  }
}

async function processAIBattleJudgment(context) {
  const { character, action, turn, gameSettings, previousTurns } = context;

  // 캐릭터 프로필 생성
  const characterProfile = buildCharacterProfile(character);

  // 배틀 상황 분석
  const battleContext = analyzeBattleContext(previousTurns, turn);

  // AI 프롬프트 구성
  const aiPrompt = buildAIJudgmentPrompt({
    characterProfile,
    action,
    battleContext,
    gameSettings,
  });

  try {
    // OpenAI API 호출 (실제 AI 서비스로 교체 가능)
    const aiResponse = await callAIJudge(aiPrompt);

    // 응답 파싱 및 구조화
    const parsedResult = parseAIResponse(aiResponse);

    // 게임 상태 업데이트 결정
    const gameUpdates = determineGameUpdates(parsedResult, character);

    return {
      narrative: parsedResult.narrative,
      result: parsedResult.result,
      effects: gameUpdates.effects,
      battleEnd: gameUpdates.battleEnd,
      winner: gameUpdates.winner,
      characterUpdates: gameUpdates.characterUpdates,
    };
  } catch (error) {
    console.error('AI 판정 호출 오류:', error);

    // 폴백 응답
    return {
      narrative: `${character.name}이(가) ${action.text}을(를) 시도합니다. 상황이 복잡해지고 있습니다.`,
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
      characterUpdates: null,
    };
  }
}

function buildCharacterProfile(character) {
  return {
    name: character.name,
    abilities: character.abilities || [],
    background: character.background || '',
    personality: character.personality || '',
    stats: {
      strength: character.strength || 50,
      agility: character.agility || 50,
      intelligence: character.intelligence || 50,
      charisma: character.charisma || 50,
    },
    equipment: character.equipment || [],
    specialSkills: character.specialSkills || [],
  };
}

function analyzeBattleContext(previousTurns, currentTurn) {
  if (!previousTurns || previousTurns.length === 0) {
    return {
      battlePhase: 'opening',
      momentum: 'neutral',
      intensity: 'building',
    };
  }

  // 최근 턴들 분석
  const recentResults = previousTurns.slice(-3).map(turn => turn.result);

  let momentum = 'neutral';
  if (
    recentResults.filter(r => r === 'success').length >
    recentResults.filter(r => r === 'failure').length
  ) {
    momentum = 'favorable';
  } else if (
    recentResults.filter(r => r === 'failure').length >
    recentResults.filter(r => r === 'success').length
  ) {
    momentum = 'unfavorable';
  }

  return {
    battlePhase: currentTurn < 3 ? 'opening' : currentTurn > 10 ? 'climax' : 'development',
    momentum,
    intensity: currentTurn > 5 ? 'high' : 'moderate',
    turnCount: currentTurn,
  };
}

function buildAIJudgmentPrompt({ characterProfile, action, battleContext, gameSettings }) {
  const contextDescription = gameSettings.worldSetting || '판타지 배틀 아레나';

  return `
당신은 공정하고 흥미진진한 AI 배틀 심판입니다. 다음 상황을 판정해주세요:

## 게임 설정
- 세계관: ${contextDescription}
- 배틀 환경: ${gameSettings.environment || '일반 아레나'}

## 캐릭터 정보
- 이름: ${characterProfile.name}
- 능력치: 힘 ${characterProfile.stats.strength}, 민첩 ${characterProfile.stats.agility}, 지능 ${characterProfile.stats.intelligence}, 매력 ${characterProfile.stats.charisma}
- 특별능력: ${characterProfile.abilities.join(', ') || '없음'}
- 장비: ${characterProfile.equipment.join(', ') || '기본 장비'}

## 현재 상황
- 배틀 단계: ${battleContext.battlePhase}
- 현재 흐름: ${battleContext.momentum}
- 긴장감 수준: ${battleContext.intensity}
- 턴 수: ${battleContext.turnCount}

## 캐릭터의 행동
${characterProfile.name}이(가) "${action.prompt || action.text}"를 시도합니다.

## 판정 요청
다음 형식으로 응답해주세요:

**서술**: 행동의 결과를 생생하고 흥미롭게 서술해주세요 (2-3문장)
**결과**: success/partial/failure/critical 중 하나
**효과**: 필요시 특별한 시각적 효과나 캐릭터 변화 설명
**배틀종료**: true/false (배틀이 끝났는지)
**승자**: 배틀이 끝났다면 승자 이름

판정 기준:
1. 캐릭터의 능력치와 행동의 적합성
2. 현재 배틀 상황과 흐름
3. 게임의 재미와 균형
4. 예측 가능하면서도 놀라운 전개

공정하되 흥미진진한 판정을 내려주세요!
`;
}

async function callAIJudge(prompt) {
  // 실제 환경에서는 OpenAI API 또는 다른 AI 서비스 호출
  // 여기서는 예시 응답을 반환

  // 환경변수에서 AI API 키 가져오기
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('AI API 키가 설정되지 않았습니다');
  }

  try {
    // OpenAI API 호출 예시
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '당신은 게임 배틀 심판 AI입니다. 공정하고 흥미진진한 판정을 내려주세요.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('AI API 호출 오류:', error);

    // 폴백 응답
    return generateFallbackResponse(prompt);
  }
}

function generateFallbackResponse(prompt) {
  // AI API가 실패했을 때의 기본 응답
  const fallbackResponses = [
    '**서술**: 치열한 공방이 펼쳐지며 양쪽 모두 최선을 다합니다. 승부의 향방을 예측하기 어려운 상황입니다.\n**결과**: partial\n**효과**: 긴장감 상승\n**배틀종료**: false\n**승자**: 없음',
    '**서술**: 뛰어난 판단력으로 상황을 유리하게 이끌어갑니다. 하지만 상대도 만만치 않은 대응을 보여줍니다.\n**결과**: success\n**효과**: 자신감 증가\n**배틀종료**: false\n**승자**: 없음',
    '**서술**: 예상치 못한 변수가 발생하며 계획에 차질이 생깁니다. 새로운 전략이 필요한 시점입니다.\n**결과**: failure\n**효과**: 재정비 필요\n**배틀종료**: false\n**승자**: 없음',
  ];

  return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
}

function parseAIResponse(aiResponse) {
  try {
    // AI 응답을 파싱하여 구조화된 데이터로 변환
    const lines = aiResponse.split('\n').filter(line => line.trim());

    const parsed = {
      narrative: '',
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
    };

    lines.forEach(line => {
      if (line.includes('**서술**:')) {
        parsed.narrative = line.replace('**서술**:', '').trim();
      } else if (line.includes('**결과**:')) {
        const result = line.replace('**결과**:', '').trim().toLowerCase();
        parsed.result = ['success', 'partial', 'failure', 'critical'].includes(result)
          ? result
          : 'continue';
      } else if (line.includes('**배틀종료**:')) {
        parsed.battleEnd = line.toLowerCase().includes('true');
      } else if (line.includes('**승자**:')) {
        const winner = line.replace('**승자**:', '').trim();
        parsed.winner = winner !== '없음' && winner !== '' ? winner : null;
      } else if (line.includes('**효과**:')) {
        const effect = line.replace('**효과**:', '').trim();
        if (effect && effect !== '없음') {
          parsed.effects = { description: effect };
        }
      }
    });

    return parsed;
  } catch (error) {
    console.error('AI 응답 파싱 오류:', error);

    // 파싱 실패 시 기본값 반환
    return {
      narrative: aiResponse.substring(0, 200) + '...',
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
    };
  }
}

function determineGameUpdates(parsedResult, character) {
  const updates = {
    effects: null,
    battleEnd: parsedResult.battleEnd,
    winner: parsedResult.winner,
    characterUpdates: {},
  };

  // 결과에 따른 캐릭터 상태 업데이트
  switch (parsedResult.result) {
    case 'success':
      updates.characterUpdates[character.id] = {
        confidence: (character.confidence || 50) + 10,
        energy: Math.max((character.energy || 100) - 5, 0),
      };
      break;
    case 'failure':
      updates.characterUpdates[character.id] = {
        confidence: Math.max((character.confidence || 50) - 10, 0),
        energy: Math.max((character.energy || 100) - 10, 0),
      };
      break;
    case 'critical':
      updates.characterUpdates[character.id] = {
        confidence: Math.min((character.confidence || 50) + 20, 100),
        energy: Math.max((character.energy || 100) - 15, 0),
      };
      break;
  }

  // 시각적 효과 생성
  if (parsedResult.effects) {
    updates.effects = {
      characterEffects: [
        {
          characterId: character.id,
          changes: {
            scale: parsedResult.result === 'success' ? 1.1 : 0.9,
          },
        },
      ],
      visualEffects: [
        {
          type: 'text',
          content: parsedResult.effects.description,
          style: {
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: parsedResult.result === 'success' ? '#22c55e' : '#ef4444',
            fontSize: '18px',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
          },
          animation: 'fadeInOut 3s ease-in-out',
        },
      ],
    };
  }

  return updates;
}
