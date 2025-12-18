/**
 * AI 배틀 판정 시스템 API
 *
 * 캐릭터 정보와 액션을 기반으로 AI가 공정하고 흥미진진한 배틀 판정을 내립니다.
 * 게임의 핵심이 되는 AI 심판 로직입니다.
 */

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import {
  toTextBattleTurnRow,
  toTextBattleSessionRow,
} from '../../lib/runtime/textBattlePersistence.js';
import { selectParticipantForPrompt } from '../../lib/runtime/apiKeyRouting.js';

function similarityScore(a, b) {
  try {
    const norm = (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const tokens = (s) =>
      norm(s)
        .split(' ')
        .filter((t) => t && t.length > 1); // 한 글자 토큰은 노이즈 취급

    const ta = tokens(a);
    const tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    const setA = new Set(ta);
    const setB = new Set(tb);
    let common = 0;
    for (const t of setA) {
      if (setB.has(t)) common += 1;
    }
    const denom = Math.min(setA.size, setB.size) || 1;
    return common / denom;
  } catch {
    return 0;
  }
}

function computeBattleScoreSnapshot(existingScore, parsed) {
  const base =
    existingScore && typeof existingScore === 'object'
      ? existingScore
      : { hero: 0, rival: 0 };
  const score = {
    hero: Number(base.hero || 0),
    rival: Number(base.rival || 0),
  };
  if (parsed && parsed.battleEnd && parsed.winner) {
    if (parsed.winner === 'hero') score.hero += 1;
    else if (parsed.winner === 'rival') score.rival += 1;
  }
  return score;
}

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

  let routing = null;
  try {
    const routeHint = gameState && gameState.routeHint ? gameState.routeHint : null;
    routing = selectParticipantForPrompt({ gameState, prompt, routeHint });
  } catch {
    routing = null;
  }

  // 단일 호출: 한 번의 callAIJudge + 파싱/형식 검사
  const judgeOnce = async (overrideKey) => {
    const aiResponse = await callAIJudge(prompt, overrideKey);
    const parsed = parseAIResponse(aiResponse);

    let success = true;
    let fallback = false;
    let errorCategory = null;
    let userHint = null;
    let errorMessage = null;

    // 응답 형식 자체가 계약에 맞지 않는 경우
    if (parsed && parsed.formatOk === false) {
      success = false;
      fallback = true;
      errorCategory = 'format';
      userHint =
        'AI 응답 형식을 이해하지 못했습니다. 프롬프트-노드 에디터의 응답 규칙 설명을 확인하세요.';
      const isDev = process.env.NODE_ENV === 'development';
      parsed.narrative = isDev
        ? `⚠️ AI 응답 형식 오류: 응답 구조를 해석하지 못했습니다. ${userHint}`
        : '⚠️ AI 응답 형식 오류: 일시적인 문제로 이번 턴 결과를 해석하지 못했습니다.';
      errorMessage = 'LLM response did not match expected format';
    }

    // 프롬프트를 거의 그대로 반복하는 에코 응답 감지
    if (!fallback) {
      const echo = similarityScore(prompt, aiResponse);
      if (echo >= 0.9) {
        success = false;
        fallback = true;
        errorCategory = 'echo';
        userHint =
          'AI 응답이 프롬프트를 거의 그대로 반복했습니다. 프롬프트 규칙이나 예시를 조정한 뒤 다시 시도하세요.';
        const isDev = process.env.NODE_ENV === 'development';
        parsed.narrative = isDev
          ? '⚠️ AI 응답이 프롬프트를 그대로 반복해 이 턴 결과를 사용할 수 없습니다.'
          : '⚠️ AI 응답이 올바르지 않아 이 턴 결과를 사용할 수 없습니다.';
        errorMessage = `prompt/response echo detected (similarity=${echo.toFixed(2)})`;
      }
    }

    return { aiResponse, parsed, success, fallback, errorCategory, userHint, errorMessage };
  };

  const runWithRetries = async (overrideKey, maxAttempts = 3) => {
    let last = null;
    for (let i = 0; i < maxAttempts; i += 1) {
      const res = await judgeOnce(overrideKey);
      last = res;
      // 형식/에코 오류면 재시도, 그 외(성공 또는 api_key/network 등)는 즉시 반환
      if (!res.fallback || (res.errorCategory && !['format', 'echo'].includes(res.errorCategory))) {
        return res;
      }
    }
    return last;
  };

  try {
    // 참가자 라우팅에서 전달된 API 키(있다면)를 우선 사용한다.
    // callAIJudge 쪽에서 키 패턴(예: sk- / AIza 등)을 보고
    // OpenAI / Gemini 등 적절한 프로바이더를 선택한다.
    const overrideKey = routing && routing.apiKey ? routing.apiKey : null;

    let result = null;

    // 1) overrideKey가 있으면 우선 3회까지 시도
    if (overrideKey) {
      result = await runWithRetries(overrideKey, 3);
      if (
        result &&
        result.fallback &&
        result.errorCategory &&
        ['format', 'echo'].includes(result.errorCategory)
      ) {
        // 형식/에코로만 계속 실패한 경우 → 다음 키(환경 변수 기반)로 넘어간다.
        result = null;
      }
    }

    // 2) overrideKey가 없거나 형식/에코로만 실패했다면 env 기반 키로 3회 시도
    if (!result) {
      result = await runWithRetries(null, 3);
    }

    const { aiResponse, parsed, success, fallback, errorCategory, userHint, errorMessage } =
      result || (await judgeOnce(overrideKey));

    const timestamp = new Date().toISOString();
    const battleLastPayload = {
      ...parsed,
      timestamp,
      success,
      fallback,
      errorCategory,
      errorMessage,
      userHint,
      apiRouting: routing
        ? {
            origin: routing.participant?.origin || null,
            participant: {
              name: routing.participant?.name || null,
              slotNo: routing.participant?.slotNo ?? null,
              heroId: routing.participant?.heroId || null,
              ownerId: routing.participant?.ownerId || null,
            },
          }
        : null,
    };

    // 기존 스코어는 gameState.battleScore 또는 gameState.variables.battleScore에서 찾는다.
    const existingScore =
      (gameState && gameState.battleScore) ||
      (gameState && gameState.variables && gameState.variables.battleScore) ||
      null;
    const updatedScore = computeBattleScoreSnapshot(existingScore, parsed);

    // Optional: best-effort logging when gameState carries a session identifier.
    // Failures are ignored so judgement latency is not affected.
    (async () => {
      try {
        const sessionId = gameState && gameState.sessionId;
        if (!sessionId) return;
        if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') return;

        // 1) 턴 로그(text_battle_turns)
        const ctx = {
          node: {
            id: gameState.nodeId || null,
            label: gameState.nodeLabel || null,
          },
          variables: {
            // NOTE:
            // - battleLast: 구조화된 판정 결과 + timestamp
            // - battleScore: 이 턴 이후 스코어 스냅샷
            // - lastPrompt: 이 턴에 사용된 전체 프롬프트 텍스트
            // - aiResponseRaw: LLM이 반환한 전체 응답 텍스트
            battleLast: battleLastPayload,
            battleScore: updatedScore,
            lastPrompt: prompt,
            aiResponseRaw: aiResponse,
          },
        };
        const turnIndex = Number.isFinite(Number(gameState.turn))
          ? Number(gameState.turn)
          : 0;
        const turnRow = toTextBattleTurnRow({
          sessionId,
          turnIndex,
          ctx,
          durationMs: gameState.durationMs || null,
          heroId: gameState.heroId || null,
          rivalId: gameState.rivalId || null,
        });
        await supabaseAdmin.from('text_battle_turns').insert(turnRow);

        // 2) 배틀 종료 시 세션 요약(text_battle_sessions)
        if (parsed.battleEnd && parsed.winner) {
          const summaryVars = {
            battleWinner: parsed.winner || null,
            battleScore: updatedScore,
          };
          const sessionRow = toTextBattleSessionRow({
            variables: summaryVars,
          });
          const patch = {
            status: sessionRow.status,
            winner: sessionRow.winner,
            final_score: sessionRow.final_score,
          };
          await supabaseAdmin
            .from('text_battle_sessions')
            .update(patch)
            .eq('id', sessionId);
        }
      } catch {
        // ignore logging failures
      }
    })();

    return {
      // 사람이 바로 볼 수 있는 요약/내러티브
      narrative: parsed.narrative || '',
      // 원본 응답 텍스트 (전체)
      response: aiResponse,
      // 구조화된 판정 결과 (텍스트 배틀 엔진에서 outcome 토큰으로 매핑 가능)
      result: parsed.result,
      battleEnd: parsed.battleEnd,
      winner: parsed.winner,
      effects: parsed.effects || null,
      // 통합 게임 런타임이 사용할 수 있는 메타 정보
      success,
      fallback,
      errorCategory,
      errorMessage,
      userHint,
      timestamp,
      // gameState는 호출자가 관리하므로 여기서는 그대로 에코만 한다.
      gameState,
    };
  } catch (error) {
    console.error('통합 게임 프롬프트 처리 오류:', error);

    // ============================================================
    // 에러 폴백 처리
    // ============================================================
    // 이 경로는 다음 상황에서 실행됨:
    // 1. AI API 키가 없거나 잘못됨
    // 2. AI API 호출 실패 (네트워크, 타임아웃, 레이트 리밋 등)
    // 3. callAIJudge 내부에서 예외 발생
    //
    // 주의:
    // - 이 메시지는 **AI 응답이 아니라 에러 폴백**임을 명확히 해야 함
    // - 클라이언트에서 fallback: true를 보고 적절한 UI 처리 필요
    //   (예: 에러 아이콘, 재시도 버튼, 디버그 모드에서만 표시 등)
    // ============================================================

    // 캐릭터 이름 추출 우선순위:
    // 1. routing.participant.name (API 라우팅에서 선택된 참가자)
    // 2. gameState.participants[].name (게임 상태의 참가자 목록)
    // 3. character?.name (직접 전달된 캐릭터 객체)
    // 4. '시스템' (최종 폴백)
    let characterName = '시스템';
    
    try {
      // routing이 있으면 그쪽 participant 이름 우선
      if (routing && routing.participant && routing.participant.name) {
        characterName = routing.participant.name;
      } 
      // gameState에 participants 배열이 있으면 첫 번째 참가자
      else if (gameState && Array.isArray(gameState.participants) && gameState.participants.length > 0) {
        const firstParticipant = gameState.participants[0];
        characterName = firstParticipant.name || firstParticipant.hero?.name || firstParticipant.heroName || characterName;
      }
      // character 객체가 직접 전달된 경우
      else if (character && character.name) {
        characterName = character.name;
      }
    } catch {
      // 이름 추출 실패 시 기본값 유지
    }

    // 에러 타입 분류로 사용자 친화적 안내 제공
    const isDev = process.env.NODE_ENV === 'development';
    const errorMsg = error.message || '알 수 없는 오류';
    
    // 에러 카테고리 판별
    let errorCategory = 'unknown';
    let userHint = '';
    
    if (errorMsg.includes('API 키') || errorMsg.includes('apiKey') || errorMsg.includes('Unauthorized')) {
      errorCategory = 'api_key';
      userHint = '디버그 패널에서 AI API 키를 확인하세요.';
    } else if (errorMsg.includes('rate limit') || errorMsg.includes('quota') || errorMsg.includes('429')) {
      errorCategory = 'rate_limit';
      userHint = 'API 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('network')) {
      errorCategory = 'network';
      userHint = '네트워크 연결을 확인하고 재시도하세요.';
    } else {
      errorCategory = 'unknown';
      userHint = '일시적인 문제가 발생했습니다. 재시도하세요.';
    }

    // 개발 모드: 상세 에러
    // 프로덕션: 에러 종류에 따른 명확한 안내 (더 이상 모호하지 않음)
    const fallbackNarrative = isDev
      ? `⚠️ AI 판정 실패: ${errorMsg}. ${userHint}`
      : `⚠️ AI 판정 오류: ${userHint}`;

    return {
      narrative: fallbackNarrative,
      response: fallbackNarrative,
      success: false,
      fallback: true,
      errorType: error.name || 'UnknownError',
      errorCategory, // api_key | rate_limit | network | unknown
      errorMessage: isDev ? errorMsg : undefined, // 개발 모드에서만 상세 에러
      userHint, // 프로덕션에서도 액션 가능한 힌트 제공
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
    const aiResponse = await callAIJudge(aiPrompt, null);

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

async function callAIJudge(prompt, apiKeyOverride) {
  // 환경변수 또는 호출 시 전달된 API 키 가져오기
  const override = typeof apiKeyOverride === 'string' ? apiKeyOverride.trim() : '';

  // 키 패턴을 보고 프로바이더를 추론한다.
  // - OpenAI: sk- 로 시작
  // - Gemini: AIza 로 시작 (Google Generative Language API 키 형식)
  let provider = null;
  let apiKey = null;

  if (override) {
    if (override.startsWith('sk-')) {
      provider = 'openai';
      apiKey = override;
    } else if (override.startsWith('AIza')) {
      provider = 'gemini';
      apiKey = override;
    }
  }

  // override에서 프로바이더를 확정하지 못했다면 환경변수 기반으로 추론
  if (!provider) {
    if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      apiKey = process.env.OPENAI_API_KEY;
    } else if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      apiKey = process.env.GEMINI_API_KEY;
    } else if (process.env.ANTHROPIC_API_KEY) {
      provider = 'openai'; // 임시: Anthropic 키가 설정된 경우에도 OpenAI 경로로 취급
      apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  if (!provider || !apiKey) {
    throw new Error('AI API 키가 설정되지 않았습니다');
  }

  try {
    if (provider === 'gemini') {
      // Google Generative Language API (Gemini)
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const version = process.env.GEMINI_API_VERSION || 'v1beta';
      const endpoint = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey,
      )}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        let msg = `AI API 호출 실패: ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          msg += ' Unauthorized';
        } else if (response.status === 429) {
          msg += ' rate limit';
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const first = candidates[0] || {};
      const parts = (first.content && first.content.parts) || first.parts || [];
      const text = parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim();
      return text || JSON.stringify(data);
    }

    // 기본: OpenAI Chat Completions
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
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
      // 상태 코드에 따라 보다 구체적인 힌트를 남긴다.
      let msg = `AI API 호출 실패: ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        msg += ' Unauthorized';
      } else if (response.status === 429) {
        msg += ' rate limit';
      }
      throw new Error(msg);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('AI API 호출 오류:', error);
    // 에러를 상위로 전파하여 processUnifiedGamePrompt의 catch 블록에서 처리
    throw error;
  }
}

function generateFallbackResponse(prompt) {
  // 더 이상 더미 응답을 반환하지 않음
  // 에러를 던져서 상위 catch 블록에서 명확한 에러 처리
  throw new Error('AI API 호출 실패: 더미 응답 대신 명확한 에러를 표시하기 위해 에러를 전파합니다.');
}

function parseAIResponse(aiResponse) {
  try {
    const text = typeof aiResponse === 'string' ? aiResponse : String(aiResponse ?? '');
    const rawLines = text.split(/\r?\n/);
    const trimmedLines = rawLines.map((l) => l.trim()).filter(Boolean);

    const normalize = (line) =>
      String(line || '')
        .replace(/\s+/g, '')
        .replace(/[：:]/g, ':')
        .toLowerCase();

    const hasMarker = (line, key) => normalize(line).includes(key);

    const base = {
      narrative: '',
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
      formatOk: false,
    };

    // -------------------------------------------------------------------
    // 1) 레거시 포맷(**서술** / **결과** / **배틀종료** / **승자** / **효과**)
    // -------------------------------------------------------------------
    const hasLegacyMarkers = trimmedLines.some(
      (l) => l.includes('**서술**:') || l.includes('**결과**:'),
    );

    if (hasLegacyMarkers) {
      const parsed = { ...base };

      trimmedLines.forEach((line) => {
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

      parsed.formatOk = true;
      return parsed;
    }

    // -------------------------------------------------------------------
    // 2) 새 포맷 (응답 / 이번 응답의 주역 / 만족된 변수명 / 캐릭터 결과)
    // -------------------------------------------------------------------
    const hasNewMarkers = trimmedLines.some(
      (l) =>
        hasMarker(l, '이번응답의주역') ||
        hasMarker(l, '만족된변수명') ||
        hasMarker(l, '캐릭터결과'),
    );

    if (hasNewMarkers) {
      const parsed = {
        ...base,
        actor: null,
        satisfiedVars: [],
        characterResults: {},
      };

      // 내레이션: "응답:" 줄 이후 ~ 메타 섹션 직전까지
      const idxResponse = rawLines.findIndex((l) => normalize(l).startsWith('응답:'));
      if (idxResponse >= 0) {
        const narrativeLines = [];
        const first = rawLines[idxResponse];
        const firstBody = first.split('응답:')[1];
        if (firstBody && firstBody.trim()) {
          narrativeLines.push(firstBody.trim());
        }

        for (let i = idxResponse + 1; i < rawLines.length; i++) {
          const t = rawLines[i].trim();
          if (
            t.startsWith('이번 응답의 주역:') ||
            t.startsWith('만족된 변수명:') ||
            t.startsWith('캐릭터 결과:')
          ) {
            break;
          }
          if (/^-{5,}$/.test(t)) {
            // 구분선은 내레이션에 포함하지 않는다
            continue;
          }
          narrativeLines.push(rawLines[i]);
        }

        parsed.narrative = narrativeLines.join('\n').trim();
      } else {
        // "응답:" 헤더가 없으면 전체를 내레이션으로 취급
        parsed.narrative = text.trim();
      }

      // 메타 정보 파싱
      rawLines.forEach((lineRaw) => {
        const line = lineRaw.trim();
        const norm = normalize(line);

        if (norm.includes('이번응답의주역')) {
          const value = lineRaw.split(':').slice(1).join(':');
          parsed.actor = value ? value.trim() || null : null;
        } else if (norm.includes('만족된변수명')) {
          const value = lineRaw.split(':').slice(1).join(':');
          if (value) {
            const v = value.trim();
            if (v && v !== '없음') {
              parsed.satisfiedVars = v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
        } else if (norm.includes('캐릭터결과')) {
          const value = lineRaw.split(':').slice(1).join(':');
          if (value) {
            const v = value.trim();
            if (v && v !== '없음') {
              const pairs = v.split(',').map((s) => s.trim()).filter(Boolean);
              const statusMap = {};
              pairs.forEach((p) => {
                const [id, status] = p.split('=').map((s) => s.trim());
                if (!id || !status) return;
                statusMap[id] = status;
              });
              parsed.characterResults = statusMap;

              const heroStatus = statusMap.hero || null;
              const rivalStatus = statusMap.rival || null;

              // 단순 규칙:
              // - hero=win & rival!=win → hero 승
              // - rival=win & hero!=win → rival 승
              // - 그 외에는 winner 없음
              if (heroStatus === 'win' && rivalStatus !== 'win') {
                parsed.winner = 'hero';
              } else if (rivalStatus === 'win' && heroStatus !== 'win') {
                parsed.winner = 'rival';
              } else {
                parsed.winner = null;
              }

              // 종료 여부는 win/out 이 하나라도 있으면 true 로 본다 (초기 규칙)
              const hasTerminal = Object.values(statusMap).some(
                (s) => s === 'win' || s === 'out',
              );
              parsed.battleEnd = hasTerminal;

              // winner 가 있으면 result 를 success 로 올려 준다.
              if (parsed.winner && parsed.result === 'continue') {
                parsed.result = 'success';
              }
            }
          }
        }
      });

      parsed.formatOk = true;
      return parsed;
    }

    // -------------------------------------------------------------------
    // 3) 어떤 포맷에도 맞지 않을 경우: 전체 텍스트를 내레이션으로 사용
    // -------------------------------------------------------------------
    return {
      ...base,
      narrative: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
    };
  } catch (error) {
    console.error('AI 응답 파싱 오류:', error);

    // 파싱 실패 시 기본값 반환
    const safe = typeof aiResponse === 'string' ? aiResponse : String(aiResponse ?? '');
    return {
      narrative: safe.substring(0, 200) + (safe.length > 200 ? '...' : ''),
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
      formatOk: false,
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
