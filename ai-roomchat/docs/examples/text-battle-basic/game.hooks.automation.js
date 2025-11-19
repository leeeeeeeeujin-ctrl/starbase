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
    const body = {
      prompt,
      gameState: {
        nodeId: ctx?.node?.id || null,
        turn: ctx?.turn ?? null,
        variables: ctx?.variables || {},
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
    try {
      const vars = ctx.variables || {};
      vars.battleLast = {
        narrative: data.narrative || data.response || '',
        result: data.result || 'continue',
        battleEnd: !!data.battleEnd,
        winner: data.winner || null,
        effects: data.effects || null,
        timestamp: data.timestamp || null,
      };
      ctx.variables = vars;
    } catch {
      // ignore variable update errors
    }

    // 매우 단순한 매핑 예시:
    // - result === 'success' → hero가 우세 → on_hero_win
    // - result === 'failure' → rival이 우세 → on_rival_win
    // - 그 외에는 on_tie 또는 기본 엣지를 사용
    const outcome = (data.result || '').toLowerCase();
    if (outcome === 'success' && routes.on_hero_win) return routes.on_hero_win;
    if (outcome === 'failure' && routes.on_rival_win) return routes.on_rival_win;
    if ((outcome === 'partial' || outcome === 'continue') && routes.on_tie) {
      return routes.on_tie;
    }

    return null;
  }

  // 그 외에는 그래프의 기본 엣지(selectNext 또는 첫 번째 neighbor)를 사용하도록 null 반환
  return null;
}
