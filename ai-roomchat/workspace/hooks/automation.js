/**
 * 텍스트 배틀용 기본 onBattleEnd 훅 스켈레톤.
 *
 * StartClient가 variables.battleLast.battleEnd === true 인 시점에
 * 한 번 호출되며, 반환값은 /api/rank/settle → score-default → /battle-log 뷰에서 소비된다.
 *
 * ctx:
 *  - turnLog: battleLogSchema 기준으로 정규화된 이벤트 배열
 *  - participants: slotId -> { ownerId, heroName, role, team, score? }
 *  - variables: 마지막 턴 이후의 변수 스냅샷 (coreRuntime variables)
 *  - graphHash, hookHash: 선택적 해시/버전 정보
 */
export function onBattleEnd(ctx) {
  const turnLog = Array.isArray(ctx?.turnLog) ? ctx.turnLog : [];
  const participants = ctx?.participants && typeof ctx.participants === 'object'
    ? ctx.participants
    : {};

  // outcome / scores는 기본적으로 score-default.js 에서 계산하므로,
  // 여기서는 특별한 룰이 없으면 최소한의 메타 정보만 반환한다.
  const outcome = {};
  const scores = {};

  // 필요 시 Maker가 아래를 채워서 커스텀할 수 있다:
  // - outcome.winners / outcome.losers / outcome.draw
  // - scores[slotId] = { delta, total?, reason? }
  // - highlightIds = ['ev-123', ...]
  // - templateId / templateVars: 베틀로그 뷰에서 사용할 템플릿 메타

  const highlightIds = [];

  const meta = {
    // 선택: 텍스트 배틀 템플릿/플레이 모드 식별자 등을 넣을 수 있다.
    // templateId: 'text-battle/default',
    // templateVars: { mode: 'ranked', genre: 'text_battle' },
    participantsCount: Object.keys(participants).length,
    turnCount: turnLog.length,
  };

  return {
    outcome,
    scores,
    highlightIds,
    templateId: meta.templateId || null,
    templateVars: meta.templateVars || meta,
  };
}

