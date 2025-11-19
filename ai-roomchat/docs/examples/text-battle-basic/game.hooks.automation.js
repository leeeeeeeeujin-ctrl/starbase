// Example /game/hooks/automation.js for the "text-battle-basic" sample.
//
// NOTE:
// - 이 파일은 예시용입니다. 실제 워크스페이스에서는
//   경로를 `/game/hooks/automation.js`로 맞춘 뒤 사용해야 합니다.
// - 기본 버전은 "프롬프트를 어떻게 만들고, 노드 이동을 어떻게 결정할지"만 다룹니다.
// - 아래 onUserAction은 `/api/ai-battle-judge`와 직접 통신하는 예시도 포함하고 있으니,
//   실제 프로젝트에서는 보안/타임아웃/에러 처리 정책에 맞게 조정해야 합니다.

function getBattleConfig(ctx) {
  const node = ctx?.node || {};
  const cfg = node.config && node.config.battle ? node.config.battle : {};
  return cfg;
}

function safeRoutes(battle) {
  const r = battle && battle.routes;
  return r && typeof r === 'object' ? r : {};
}

// NOTE: 훅 코드 안에서는 런타임 헬퍼(`ai-roomchat/lib/runtime/battleResult.js`)를
// 직접 import 할 수 없으므로, 여기에서 필요한 부분만 가볍게 복제해 둔다.
// `/api/ai-battle-judge` 응답을 받아:
// - variables.battleLast
// - variables.battleResult
// - variables.battleWinner
// - variables.battleScore
// - variables.battleHistory
// 를 일관된 형태로 갱신하는 역할을 한다.
function applyBattleOutcomeLocal(ctx, params) {
  if (!ctx || typeof ctx !== 'object') return null;

  const vars =
    ctx.variables && typeof ctx.variables === 'object'
      ? ctx.variables
      : (ctx.variables = {});

  const narrative = params.narrative || params.response || '';
  const rawResult = (params.result || '').toLowerCase();
  const result = rawResult || 'continue';
  const battleEnd = !!params.battleEnd;
  const winner = params.winner || null;
  const effects = params.effects || null;
  const timestamp = params.timestamp || null;

  vars.battleLast = {
    narrative,
    result,
    battleEnd,
    winner,
    effects,
    timestamp,
  };

  // battleResult: 그래프/라우팅에서 쓰기 좋은 짧은 토큰으로 축약
  let outcomeToken = 'continue';
  if (winner && result === 'success') {
    if (winner === 'hero') outcomeToken = 'hero_win';
    else if (winner === 'rival') outcomeToken = 'rival_win';
    else outcomeToken = `winner_${winner}`;
  } else if (result === 'failure' && winner === 'rival') {
    outcomeToken = 'rival_win';
  } else if (result === 'partial' || result === 'continue') {
    outcomeToken = 'tie';
  }
  vars.battleResult = outcomeToken;

  if (battleEnd && winner) {
    vars.battleWinner = winner;
  }

  // 매우 단순한 스코어 예시: battleEnd 시 승자 쪽 점수 +1
  const prevScore =
    vars.battleScore && typeof vars.battleScore === 'object'
      ? vars.battleScore
      : { hero: 0, rival: 0 };
  const score = {
    hero: Number(prevScore.hero || 0),
    rival: Number(prevScore.rival || 0),
  };
  if (battleEnd && winner) {
    if (winner === 'hero') score.hero += 1;
    else if (winner === 'rival') score.rival += 1;
  }
  vars.battleScore = score;

  // 간단한 히스토리: 최근 N 턴을 누적해 transformPrompt에서 참조
  const history = Array.isArray(vars.battleHistory)
    ? vars.battleHistory.slice(-9)
    : [];
  history.push({
    node: ctx.node && ctx.node.id,
    text: narrative,
    winner,
    result,
  });
  vars.battleHistory = history;

  ctx.variables = vars;

  return {
    battleLast: vars.battleLast,
    battleResult: vars.battleResult,
    battleWinner: vars.battleWinner,
    battleScore: vars.battleScore,
  };
}

export function transformPrompt(ctx) {
  const node = ctx?.node || {};
  const battle = getBattleConfig(ctx);
  const routes = safeRoutes(battle);
  const profile = battle.promptProfile || {};
  const sides = Array.isArray(battle.sides) ? battle.sides : [];

  const stage = profile.stage || node.id || 'battle_stage';
  const tone = profile.tone || 'competitive_but_fun';
  const includeTurns = Number.isFinite(profile.includePreviousTurns)
    ? profile.includePreviousTurns
    : 2;

  const history = Array.isArray(ctx.variables?.battleHistory)
    ? ctx.variables.battleHistory
    : [];
  const recent = history.slice(-includeTurns);

  const sideSummary = sides
    .map((s, idx) => `- side${idx + 1}: id=${s.id || '(unknown)'}, characterRef=${s.characterRef || '(none)'}`)
    .join('\n');

  const historyText = recent.length
    ? recent.map((h, i) => `${i + 1}. [${h.node || '?'}] ${h.text || ''}`).join('\n')
    : '(이전 턴 기록 없음)';

  const routesText = Object.keys(routes).length
    ? Object.entries(routes).map(([k, v]) => `- ${k} -> ${v}`).join('\n')
    : '(라우트 없음: 기본 그래프 엣지 사용)';

  // 이 프롬프트는 "심판 겸 연출자"에게 현재 상황을 설명하고,
  // 어떻게 진행하면 좋을지 자유롭게 묘사하게 만드는 예시입니다.
  // 실제 프로젝트에서는 이 프롬프트를 바탕으로 모델이
  // 1) 각 캐릭터의 대사,
  // 2) 누가 우세한지,
  // 3) 다음에 어떤 노드로 가야 할지에 대한 힌트
  // 를 포함한 JSON이나 명시적인 지시문을 반환하도록 설계할 수 있습니다.
  const prompt = [
    `당신은 AI 텍스트 배틀의 심판이자 연출자입니다.`,
    ``,
    `현재 배틀 단계(stage): ${stage}`,
    `톤(tone): ${tone}`,
    ``,
    `참여 중인 진영/캐릭터:`,
    sideSummary,
    ``,
    `최근 턴 기록:`,
    historyText,
    ``,
    `이 노드에서 가능한 라우트(routes) 예시:`,
    routesText,
    ``,
    `- 위 정보를 바탕으로 이번 턴에 어떤 장면이 펼쳐질지 한국어로 생생하게 묘사해 주세요.`,
    `- 각 캐릭터가 어떤 말/행동을 하는지 구체적으로 써 주세요.`,
    `- (선택) 마지막에 '누가 우세한지'에 대한 짧은 평가를 덧붙여도 좋습니다.`,
    ``,
    `※ 참고: 실제 승패/노드 이동 결정 로직은 별도의 규칙(onUserAction/selectNext)에서 처리됩니다.`
  ].join('\n');

  return prompt;
}

async function callBattleJudge(prompt, ctx) {
  try {
    const battle = getBattleConfig(ctx);
    const sides = Array.isArray(battle.sides) ? battle.sides : [];
    const vars = (ctx && ctx.variables) || {};

    // 세션/플레이어 정보는 우선 ctx.variables에서 찾고,
    // 없으면 battle.sides를 간단히 매핑해 사용한다.
    const sessionId = vars.battleSessionId || null;
    const heroSide = sides[0] || null;
    const rivalSide = sides[1] || null;
    const heroId =
      vars.battleHeroId ||
      (heroSide && (heroSide.playerId || heroSide.id || heroSide.characterRef)) ||
      null;
    const rivalId =
      vars.battleRivalId ||
      (rivalSide && (rivalSide.playerId || rivalSide.id || rivalSide.characterRef)) ||
      null;
    const battleScore = vars.battleScore || null;

    const body = {
      prompt,
      gameState: {
        nodeId: ctx?.node?.id || null,
        nodeLabel: ctx?.node?.label || null,
        turn: ctx?.turn ?? null,
        variables: vars,
        sessionId,
        heroId,
        rivalId,
        battleScore,
      },
      character: null,
    };
    const res = await fetch('/api/ai-battle-judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }
    const json = await res.json();
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function onUserAction(ctx, input) {
  const text = String(input || '').trim();
  const node = ctx?.node || {};
  const battle = getBattleConfig(ctx);
  const routes = safeRoutes(battle);

  // 예시 1) 수동 토큰: 개발/디버그 용도
  if (text === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;
  if (text === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;
  if (text === 'tie' && routes.on_tie) return routes.on_tie;
  if (text === 'rematch' && routes.on_rematch) return routes.on_rematch;
  if (text === 'end' && routes.on_end) return routes.on_end;

  // 예시 2) 자동 판정: "auto" 입력 시 `/api/ai-battle-judge` 호출
  if (text === 'auto') {
    const prompt = transformPrompt(ctx);
    const result = await callBattleJudge(prompt, ctx);
    if (!result.ok || !result.data) {
      // 실패 시에는 그래프 기본 엣지(selectNext 또는 첫 neighbor)에 맡긴다.
      return null;
    }
    const data = result.data;

    // 응답을 variables에 저장해 훅/프롬프트에서 참고할 수 있게 한다.
    // (applyBattleOutcomeLocal은 battleLast/battleResult/battleWinner/battleScore/battleHistory를
    //  한 번에 갱신해 준다.)
    const outcome = applyBattleOutcomeLocal(ctx, {
      narrative: data.narrative || data.response || '',
      result: data.result,
      battleEnd: data.battleEnd,
      winner: data.winner,
      effects: data.effects,
      timestamp: data.timestamp,
    });

    // battleResult 토큰을 라우트 키에 매핑:
    // - 'hero_win'  → routes.on_hero_win
    // - 'rival_win' → routes.on_rival_win
    // - 'tie'       → routes.on_tie
    const token = outcome && outcome.battleResult;
    if (token === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;
    if (token === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;
    if (token === 'tie' && routes.on_tie) return routes.on_tie;

    return null;
  }

  // 그 외에는 그래프의 기본 엣지(selectNext 또는 첫 번째 neighbor)를 사용하도록 null 반환
  return null;
}
