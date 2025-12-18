/**
 * 텍스트 배틀용 기본 훅 구현.
 *
 * 이 파일은 "텍스트 배틀"을 첫 번째 장르 프리셋으로 제공하며,
 * 노드 타입에 따라 AI 판정을 자동 또는 수동으로 실행합니다:
 * 
 * 1. AI 프롬프트 노드: onTurnStart()에서 자동으로 AI 판정 실행
 * 2. 유저 행동 노드: onUserAction()에서 사용자 입력을 받아 AI 판정 실행
 * 3. 시스템 노드: AI 판정 없이 프롬프트만 표시
 *
 * Play 디버그 패널 → AI 판정 → variables 갱신 → 턴 로그 → Rank settle → 배틀로그 뷰까지의
 * 전체 수직선을 즉시 사용할 수 있습니다.
 *
 * 다른 장르(보드게임, 액션, 퍼즐 등)를 만들 때는
 * 이 함수들을 참고해 변형하거나, 새로운 훅을 추가하면 됩니다.
 */

// =============================================================================
// 컨텍스트/variables 구조 메모 (JSDoc)
// =============================================================================

/**
 * @typedef {Object} TextBattleContext
 * @property {{ id?: string, label?: string, type?: string, config?: Object }} [node]
 *   현재 턴의 그래프 노드. label 은 사용자에게 보이는 프롬프트 제목, config.battle 에는 배틀 설정이 들어갑니다.
 * @property {Object} [variables]
 *   런타임 상태 저장소. battleLast / battleResult / battleScore / stats / scene / effects / speaker 등 표준 슬롯과
 *   debug 용 메타데이터를 모두 포함합니다.
 * @property {{
 *   narrative?: string,
 *   result?: string,
 *   battleEnd?: boolean,
 *   winner?: string,
 *   effects?: any,
 *   timestamp?: string,
 * }} [variables.battleLast]
 *   가장 최근 AI 판정 결과 및 내레이션. useBuiltinRuntime.publishResult() 에서 사용자 메시지를 만들 때 우선 소비됩니다.
 * @property {{
 *   battleScore?: { hero?: number, rival?: number },
 *   battleHistory?: Array<{ node?: string, text?: string, winner?: string, result?: string }>,
 *   speaker?: { role?: string, accentColor?: string },
 *   stats?: Object,
 *   scene?: Object,
 *   effects?: Object,
 *   debug?: {
 *     aiCalls?: Array<{
 *       kind?: string,
 *       ok?: boolean,
 *       result?: string | null,
 *       winner?: string | null,
 *       timestamp?: string,
 *       promptPreview?: string | null,
 *     }>,
 *     participants?: Array<any>,
 *   },
 * }} [variables]
 *   텍스트 배틀에서 사용하는 대표적인 슬롯 구조. 훅 구현 시에는 필요한 필드만 부분적으로 참조해도 됩니다.
 * @property {number} [turn]
 *   현재 턴 번호. battleHistory / stats.turn 계산에 사용됩니다.
 */

// =============================================================================
// 헬퍼 함수들
// =============================================================================

function getBattleConfig(ctx) {
  const node = ctx?.node || {};
  const cfg = node.config && node.config.battle ? node.config.battle : {};
  return cfg;
}

function getRankContext(ctx) {
  try {
    const vars = ctx && ctx.variables;
    const rank = vars && vars.rank;
    if (!rank || typeof rank !== 'object') return null;
    return rank;
  } catch {
    return null;
  }
}

function safeRoutes(battle) {
  const r = battle && battle.routes;
  return r && typeof r === 'object' ? r : {};
}

// AI 판정 결과를 variables에 일관되게 저장하는 헬퍼
// (런타임 헬퍼를 import 할 수 없으므로 훅 내부에서 복제)
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
  const fallback = params.fallback === true;
  const errorType = params.errorType || null;
  const errorCategory = params.errorCategory || null;
  const errorMessage = params.errorMessage || null;
  const userHint = params.userHint || null;
  const actor = params.actor || null;
  const satisfiedVars = Array.isArray(params.satisfiedVars)
    ? params.satisfiedVars
    : null;
  const characterResults =
    params.characterResults && typeof params.characterResults === 'object'
      ? params.characterResults
      : null;

  vars.battleLast = {
    narrative,
    result,
    battleEnd,
    winner,
    effects,
    timestamp,
    fallback,
    errorType,
    errorCategory,
    errorMessage,
    userHint,
    actor,
    satisfiedVars,
    characterResults,
  };

  // battleResult: 그래프 라우팅에서 쓰기 좋은 짧은 토큰으로 축약
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

  // 표준 데이터 슬롯: stats / scene / effects / speaker
  const stats = (vars.stats && typeof vars.stats === 'object') ? vars.stats : {};
  stats.turn = typeof ctx.turn === 'number' ? ctx.turn : (stats.turn || 0);
  stats.heroScore = score.hero;
  stats.rivalScore = score.rival;
  vars.stats = stats;

  const scene = (vars.scene && typeof vars.scene === 'object') ? vars.scene : {};
  scene.summary = narrative;
  vars.scene = scene;

  if (effects && Array.isArray(effects)) {
    vars.effects = vars.effects && typeof vars.effects === 'object' ? vars.effects : {};
    vars.effects.active = effects;
  }

  const speaker = {};
  if (winner === 'hero') {
    speaker.role = 'hero';
    speaker.accentColor = '#60a5fa';
  } else if (winner === 'rival') {
    speaker.role = 'rival';
    speaker.accentColor = '#f97373';
  }
  if (Object.keys(speaker).length) {
    vars.speaker = speaker;
  }

  ctx.variables = vars;

  return {
    battleLast: vars.battleLast,
    battleResult: vars.battleResult,
    battleWinner: vars.battleWinner,
    battleScore: vars.battleScore,
  };
}

async function callBattleJudge(prompt, ctx) {
  try {
    const battle = getBattleConfig(ctx);
    const sides = Array.isArray(battle.sides) ? battle.sides : [];
    const vars = (ctx && ctx.variables) || {};
    const rank = getRankContext(ctx);

    const sessionId =
      vars.battleSessionId ||
      (rank && rank.sessionId) ||
      null;
    const heroSide = sides[0] || null;
    const rivalSide = sides[1] || null;
    let heroId = vars.battleHeroId || null;
    let rivalId = vars.battleRivalId || null;

    if ((!heroId || !rivalId) && rank && Array.isArray(rank.players)) {
      const heroFromRank = rank.players.find(p => p.role === '공격' || p.role === 'hero');
      const rivalFromRank = rank.players.find(p => p.role === '수비' || p.role === 'rival');
      if (!heroId && heroFromRank) heroId = heroFromRank.heroId || heroFromRank.ownerId || null;
      if (!rivalId && rivalFromRank) rivalId = rivalFromRank.heroId || rivalFromRank.ownerId || null;
    }

    if (!heroId) {
      heroId =
        (heroSide && (heroSide.playerId || heroSide.id || heroSide.characterRef)) ||
        null;
    }

    if (!rivalId) {
      rivalId =
        (rivalSide && (rivalSide.playerId || rivalSide.id || rivalSide.characterRef)) ||
        null;
    }
    const battleScore = vars.battleScore || null;

    const nodeConfig = (ctx.node && ctx.node.config) || {};
    const routeHint = {};
    if (typeof nodeConfig.apiKeySlot === 'number') {
      routeHint.slotNo = nodeConfig.apiKeySlot;
    }
    if (typeof nodeConfig.apiKeyToken === 'string' && nodeConfig.apiKeyToken.trim()) {
      routeHint.token = String(nodeConfig.apiKeyToken).trim();
    }

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
        routeHint,
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

// =============================================================================
// 메인 훅 함수들
// =============================================================================

/**
 * onTurnStart: 노드 진입 시 coreRuntime에서 자동으로 호출됩니다.
 *
 * AI 프롬프트 노드(`config.autoJudge === true` 또는 `type: 'ai_prompt'`)에서
 * 자동으로 AI 판정을 실행하고 결과를 variables.battleLast / battleResult / battleScore 에 저장합니다.
 *
 * 이 훅은 coreRuntime.step()에서 새 노드 진입 시 호출되며,
 * 전체 컨텍스트(node, variables, turn, files, world 등)를 받습니다.
 *
 * @param {TextBattleContext} ctx
 */
export async function onTurnStart(ctx) {
  const node = ctx?.node || {};
  const nodeConfig = node.config || {};

  const nodeType = node.type || nodeConfig.type || null;

  // AI 프롬프트 노드 판별:
  // - config.autoJudge === true 인 노드
  // - 타입이 'ai_prompt' 인 노드
  // - 텍스트 배틀 예제(graph.prompt-graph.json)에서 사용하는 타입 'battle' 노드
  //   (opening / mid_round / judge 등)
  const isAIPromptNode =
    nodeConfig.autoJudge === true ||
    nodeType === 'ai_prompt' ||
    nodeType === 'battle';

  if (!isAIPromptNode) {
    // 유저 행동 노드나 시스템 노드는 자동 판정 스킵
    return;
  }

  // AI 판정 자동 실행
  const prompt = transformPrompt(ctx);
  // 디버그용: 어떤 노드/턴에서 어떤 심판용 프롬프트를 생성했는지 1줄 요약
  try {
    console.log('[onTurnStart] auto judge 시작', {
      nodeId: ctx?.node?.id,
      turn: ctx?.turn,
      promptPreview: typeof prompt === 'string' ? prompt.slice(0, 80) : null,
    });
  } catch {}
  const result = await callBattleJudge(prompt, ctx);
  
  if (!result.ok || !result.data) {
    // 실패 시에도 진행은 계속됨 (에러는 로그에만 기록)
    console.warn('[onTurnStart] AI judge call failed:', result.error);
    return;
  }

  const data = result.data;

  // 응답을 variables에 저장
  applyBattleOutcomeLocal(ctx, {
    narrative: data.narrative || data.response || '',
    result: data.result,
    battleEnd: data.battleEnd,
    winner: data.winner,
    effects: data.effects,
    timestamp: data.timestamp,
    fallback: data.fallback,
    errorType: data.errorType,
    errorCategory: data.errorCategory,
    errorMessage: data.errorMessage,
    userHint: data.userHint,
  });

  // AI 호출 디버그 로그 기록
  try {
    const vars = ctx.variables || {};
    const debug = vars.debug || {};
    const calls = Array.isArray(debug.aiCalls) ? debug.aiCalls.slice(-9) : [];
    const ok = !!result.ok && !data.fallback;
    calls.push({
      kind: 'battle-judge-auto',
      ok,
      result: data.result || null,
      winner: data.winner || null,
      timestamp: data.timestamp || new Date().toISOString(),
      promptPreview: typeof prompt === 'string' ? prompt.slice(0, 240) : null,
      fallback: !!data.fallback,
      errorCategory: data.errorCategory || null,
      userHint: data.userHint || null,
      errorMessage: data.errorMessage || null,
      httpError: !result.ok ? result.error || null : null,
    });
    debug.aiCalls = calls;
    vars.debug = debug;
  } catch {
    // 디버그 로그 실패는 무시
  }
}

/**
 * transformPrompt: 현재 컨텍스트를 바탕으로 AI 심판용 프롬프트를 생성합니다.
 */
export function transformPrompt(ctx) {
  const node = ctx?.node || {};
  const data = node.data || {};
  const battle = getBattleConfig(ctx);
  const routes = safeRoutes(battle);
  const profile = battle.promptProfile || {};
  const sides = Array.isArray(battle.sides) ? battle.sides : [];
  const rank = getRankContext(ctx);

  // 0) 텍스트 배틀 설정이 없다면, 노드 템플릿을 그대로 사용
  //    (단일 노드/간단 디버그용: 프롬프트-노드 에디터에서 작성한 텍스트를 그대로 AI에게 전달)
  if ((!battle || Object.keys(battle).length === 0) && typeof data.template === 'string') {
    const raw = data.template;
    if (raw && raw.trim()) {
      return raw;
    }
  }

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

  const rankSummary = rank
    ? [
        `세션 ID: ${rank.sessionId || '(none)'}`,
        `모드: ${rank.gameMode || '(unknown)'}`,
        `실시간: ${rank.realtimeEnabled ? '예' : '아니오'}, 난입: ${rank.dropInEnabled ? '예' : '아니오'}`,
        `참가자: ${
          Array.isArray(rank.players) && rank.players.length
            ? rank.players
                .map(
                  (p, i) =>
                    `p${i + 1}=${p.heroName || p.heroId || p.ownerId || '(unknown)'} (role=${p.role || '-'})`
                )
                .join(', ')
            : '(없음)'
        }`,
      ].join('\n')
    : '(랭크 컨텍스트 없음)';

  const historyText = recent.length
    ? recent.map((h, i) => `${i + 1}. [${h.node || '?'}] ${h.text || ''}`).join('\n')
    : '(이전 턴 기록 없음)';

  const routesText = Object.keys(routes).length
    ? Object.entries(routes).map(([k, v]) => `- ${k} -> ${v}`).join('\n')
    : '(라우트 없음: 기본 그래프 엣지 사용)';

  const ruleText =
    typeof profile.rules === 'string' && profile.rules.trim()
      ? profile.rules.trim()
      : '게임 세계관/톤/심판 기준 등은 추후 게임 등록 페이지나 프롬프트-노드 에디터에서 추가 규칙으로 확장할 수 있습니다.';

  const varGuideText =
    typeof profile.varGuide === 'string' && profile.varGuide.trim()
      ? profile.varGuide.trim()
      : '변수(variables)는 이 응답의 메타 정보(만족된 변수명, 캐릭터 결과)를 기반으로 훅에서 업데이트됩니다. 여기서는 변수 이름만 일관되게 사용하면 됩니다.';

  const templateText = typeof data.template === 'string' ? data.template.trim() : '';

  const promptLines = [
    `보내는 프롬프트 규칙`,
    `규칙:`,
    ruleText,
    ``,
    `변수 지침:`,
    varGuideText,
    `-----------------------------`,
    `프롬프트:`,
    templateText ||
      '(이 노드에 프롬프트 텍스트가 정의되어 있지 않습니다. 프롬프트-노드 에디터에서 template를 채워 주세요.)',
    ``,
    `# 입력 정보`,
    `- 배틀 단계(stage): ${stage}`,
    `- 톤(tone): ${tone}`,
    ``,
    `## 진영/캐릭터`,
    sideSummary,
    ``,
    `## 랭크/세션 컨텍스트`,
    rankSummary,
    ``,
    `## 최근 턴 기록`,
    historyText,
    ``,
    `## 라우트 정보`,
    routesText,
    ``,
    `응답 규칙:`,
    `아래 형식을 정확히 지켜서 한 번만 응답하세요.`,
    `1) 먼저 "응답:" 으로 시작하는 줄을 쓰고, 그 뒤에 이번 턴의 내레이션을 한국어로 여러 줄 작성합니다. 내레이션에는 게임 안에서 벌어지는 장면과 대사만 포함하고, 프롬프트나 규칙에 대한 메타 설명은 넣지 마세요.`,
    `2) 내레이션이 끝난 다음 줄에 "----------------------------------" 만 단독으로 적습니다.`,
    `3) 그 다음 줄 두 줄은 완전히 빈 줄로 둡니다.`,
    `4) 그 다음 줄에 "이번 응답의 주역: <주역 캐릭터 식별자>" 를 씁니다. 예: "이번 응답의 주역: hero" 또는 "이번 응답의 주역: rival".`,
    `5) 그 다음 줄에 "만족된 변수명: var_a, var_b, ..." 형식으로 씁니다. 만족된 변수가 없으면 "만족된 변수명: 없음" 이라고 적습니다.`,
    `6) 그 다음 줄에 "캐릭터 결과: hero=win, rival=lose" 처럼 "id=win|lose|out" 리스트를 쉼표로 구분해 씁니다. 결과가 없다면 "캐릭터 결과: 없음" 이라고 적습니다.`,
    `추가적인 마크다운, 설명, 다른 형식의 메타 정보는 작성하지 마세요.`,
  ];

  return promptLines.join('\n');
}

/**
 * onUserAction: 사용자 입력을 받아 다음 노드를 결정합니다.
 * 
 * **유저 행동 노드**에서 사용되며, 플레이어가 입력창에 직접 입력한 텍스트를
 * 프롬프트로 사용해 AI 판정을 요청합니다.
 * 
 * Play 디버그 패널에서는 특정 토큰("auto", "hero_win" 등)을 입력해
 * 수동으로 다음 노드를 결정할 수도 있습니다.
 */
export async function onUserAction(ctx, input) {
  const text = String(input || '').trim();
  const node = ctx?.node || {};
  const battle = getBattleConfig(ctx);
  const routes = safeRoutes(battle);

  // 수동 토큰: 개발/디버그 용도
  if (text === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;
  if (text === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;
  if (text === 'tie' && routes.on_tie) return routes.on_tie;
  if (text === 'rematch' && routes.on_rematch) return routes.on_rematch;
  if (text === 'end' && routes.on_end) return routes.on_end;

  // 자동 판정: "auto" 입력 시 /api/ai-battle-judge 호출
  if (text === 'auto') {
    const prompt = transformPrompt(ctx);
    // 디버그용: 디버그 패널에서 auto 토큰을 눌렀을 때의 심판 요청 요약
    try {
      console.log('[onUserAction] auto judge 요청', {
        nodeId: ctx?.node?.id,
        turn: ctx?.turn,
        promptPreview: typeof prompt === 'string' ? prompt.slice(0, 80) : null,
      });
    } catch {}
    const result = await callBattleJudge(prompt, ctx);
    if (!result.ok || !result.data) {
      // 실패 시에는 그래프 기본 엣지에 맡긴다
      return null;
    }
    const data = result.data;

    // 응답을 variables에 저장
    const outcome = applyBattleOutcomeLocal(ctx, {
      narrative: data.narrative || data.response || '',
      result: data.result,
      battleEnd: data.battleEnd,
      winner: data.winner,
      effects: data.effects,
      timestamp: data.timestamp,
      fallback: data.fallback,
      errorType: data.errorType,
      errorCategory: data.errorCategory,
      errorMessage: data.errorMessage,
      userHint: data.userHint,
    });

    // -----------------------------------------------------------------------
    // 프로바이더/키 문제로 AI 판정을 전혀 수행할 수 없는 경우
    // → 이 판은 무승부로 강제 종료한다.
    //
    // - data.fallback === true 이면서 errorCategory === 'api_key' 인 경우를
    //   "유효한 API 키/프로바이더를 찾지 못함"으로 간주한다.
    // - battleLast / battleResult / battleScore 를 tie 상태로 맞추어 두면,
    //   이후 onBattleEnd() 와 라우팅(on_tie) 에서 자연스럽게 처리된다.
    // -----------------------------------------------------------------------
    if (
      data.fallback &&
      (data.errorCategory === 'api_key' ||
        data.errorCategory === 'format' ||
        data.errorCategory === 'echo')
    ) {
      try {
        const vars =
          ctx.variables && typeof ctx.variables === 'object'
            ? ctx.variables
            : (ctx.variables = {});

        // battleLast를 무승부 종료 상태로 덮어쓴다.
        const last =
          vars.battleLast && typeof vars.battleLast === 'object'
            ? vars.battleLast
            : {};
        last.result = 'tie';
        last.battleEnd = true;
        last.winner = null;
        last.fallback = true;
        vars.battleLast = last;

        // 점수 스냅샷이 없다면 0:0 으로 초기화한다.
        if (!vars.battleScore || typeof vars.battleScore !== 'object') {
          vars.battleScore = { hero: 0, rival: 0 };
        }

        // 전역 battleResult 토큰도 tie 로 설정
        vars.battleResult = 'tie';

        // applyBattleOutcomeLocal 이 돌려준 토큰이 있다면 함께 덮어쓴다.
        if (outcome && typeof outcome === 'object') {
          outcome.battleResult = 'tie';
          outcome.battleEnd = true;
          outcome.winner = null;
        }
      } catch {
        // 무승부 처리 실패 시에도 게임 진행 자체는 막지 않는다.
      }
    }

    // AI 호출 디버그 로그 기록
    try {
      const vars =
        ctx.variables && typeof ctx.variables === 'object'
          ? ctx.variables
          : (ctx.variables = {});
      const debug =
        vars.debug && typeof vars.debug === 'object' ? vars.debug : (vars.debug = {});
      const calls = Array.isArray(debug.aiCalls) ? debug.aiCalls.slice(-9) : [];
      const ok = !!result.ok && !data.fallback;
      calls.push({
        kind: 'battle-judge',
        ok,
        result: data.result || null,
        winner: data.winner || null,
        timestamp: data.timestamp || new Date().toISOString(),
        promptPreview: typeof prompt === 'string' ? prompt.slice(0, 240) : null,
        fallback: !!data.fallback,
        errorCategory: data.errorCategory || null,
        userHint: data.userHint || null,
        errorMessage: data.errorMessage || null,
        httpError: !result.ok ? result.error || null : null,
      });
      debug.aiCalls = calls;
      vars.debug = debug;
      ctx.variables = vars;
    } catch {
      // 디버그 로그는 실패해도 게임 진행에 영향을 주지 않는다
    }

    // battleResult 토큰을 라우트 키에 매핑
    const token = outcome && outcome.battleResult;
    if (token === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;
    if (token === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;
    if (token === 'tie' && routes.on_tie) return routes.on_tie;

    return null;
  }

  // 그 외에는 그래프의 기본 엣지를 사용
  return null;
}

/**
 * onBattleEnd: 배틀 종료 시 최종 결과를 계산합니다.
 * 
 * StartClient가 variables.battleLast.battleEnd === true 인 시점에 호출되며,
 * 반환값은 /api/rank/settle → score-default → /battle-log 뷰에서 소비됩니다.
 */
export function onBattleEnd(ctx) {
  const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const vars = (ctx && ctx.variables && typeof ctx.variables === 'object') ? ctx.variables : {};
  const turnLog = Array.isArray(ctx && ctx.turnLog) ? ctx.turnLog : [];

  const battleScore =
    vars.battleScore && typeof vars.battleScore === 'object' ? vars.battleScore : {};
  const heroScore = safeNumber(battleScore.hero);
  const rivalScore = safeNumber(battleScore.rival);

  const scores = {
    hero: {
      delta: heroScore,
      total: heroScore,
      reason: 'battle_score',
    },
    rival: {
      delta: rivalScore,
      total: rivalScore,
      reason: 'battle_score',
    },
  };

  let winners = [];
  let losers = [];
  let draw = false;

  if (heroScore > rivalScore) {
    winners = ['hero'];
    losers = ['rival'];
  } else if (rivalScore > heroScore) {
    winners = ['rival'];
    losers = ['hero'];
  } else {
    draw = true;
  }

  // battleWinner가 variables에 있을 경우 최종 승자 힌트로 사용
  try {
    const winnerToken = vars.battleWinner || vars.battleResultWinner || null;
    if (winnerToken === 'hero' || winnerToken === 'rival') {
      winners = [winnerToken];
      losers = winnerToken === 'hero' ? ['rival'] : ['hero'];
      draw = false;
    }
  } catch {
    // 무시
  }

  // 하이라이트: summary/judge 이벤트 우선, 없으면 마지막 몇 개
  const highlightIds = [];
  try {
    const summaryLike = turnLog.filter(
      (ev) => ev && (ev.type === 'summary' || ev.type === 'judge'),
    );
    const source = summaryLike.length ? summaryLike : turnLog;
    source
      .slice(-5)
      .forEach((ev) => {
        if (!ev) return;
        const id = ev.id || ev.eventId || null;
        if (id && !highlightIds.includes(id)) {
          highlightIds.push(id);
        }
      });
  } catch {
    // 무시
  }

  const templateVars = {
    finalScore: {
      hero: heroScore,
      rival: rivalScore,
    },
    winner: winners.length === 1 ? winners[0] : null,
    draw,
  };

  // finalize_text_battle_rank 에 전달하기 좋은 최소 요약
  const finalizeSummary = {
    winner: templateVars.winner,
    final_score: templateVars.finalScore,
  };

  return {
    outcome: { winners, losers, draw },
    scores,
    highlightIds,
    templateId: 'text-battle-basic',
    templateVars,
    finalizeSummary,
  };
}
