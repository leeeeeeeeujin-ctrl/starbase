# Battle Log Schema (draft)

목적
- 턴 로그를 정규화해 정산/리플레이/배틀로그 생성 모두가 같은 구조를 쓰도록 한다.
- 프롬프트-노드/코드 에디터에서 “로그 라벨/하이라이트”를 지정하고, 실행/정산/뷰어가 동일한 필드를 소비하게 한다.

핵심 구성
1) participants 맵
   - `slotId -> { ownerId?, name?, title?, team?, role?, characterBio? }`
   - UI/템플릿에서 `{{participants[slotId].name}}` 등으로 참조.

2) turn events (정규화 레코드)
   - 공통 필드:  
     `type`, `turn`, `timestamp`, `speaker`(slotId/ownerId/name/role), `visibility`(public|private|team:<id>),  
     `summary`, `variables`(stats/scene/effects/speaker 스냅샷), `attachments?`(이미지/리플레이 링크 등 선택).
   - 타입별 필드(예시):
     - `system`: `{ note }`
     - `ai_action` / `user_action`: `{ text, channel? }`
     - `judge`: `{ verdict, rationale }`
     - `state_change`: `{ path, value }`
     - `score_change`: `{ delta, total, reason }`
     - `effect`: `{ tag, value, targetSlotId }`
     - `dialogue`: `{ text, channel }`
     - `summary`: `{ text }`

3) 하이라이트 메타
   - `highlightIds: string[]` (turn events 중 하이라이트 대상 id)
   - `outcome`: `{ winners:[slotId], losers:[slotId], draw?:boolean }`
   - `scoreboard`: `{ [slotId]: { score:number, delta?:number } }`
   - 재생성용 메타: 그래프/훅 해시, turnLog etag 등.

템플릿/렌더링
- 템플릿 엔진: Mustache 수준 가정. 입력 데이터:
  ```jsonc
  {
    "participants": { "...": { "name": "플레이어1", "team": "A" } },
    "highlightEvents": [ /* turn events 서브셋 */ ],
    "finalState": { "variables": { "stats": { /* ... */ } } },
    "outcome": { "winners": [...], "losers": [...] },
    "scoreboard": { "slotA": { "score": 120, "delta": 30 } }
  }
  ```
- 템플릿 변수 예시: `{{participants[e.speaker.slotId].name}}`, `{{e.summary}}`, `{{e.score_change.delta}}`, `{{finalState.variables.stats.turn}}`.
- 프리셋 예: 타임라인형, 하이라이트 5선, 승패 요약+핵심 대사.

훅/계약 제안
- `/game/hooks/automation.js`에 `onBattleEnd(ctx)` 추가:
  - 입력: `ctx.turnLog`(정규화 이벤트 배열), `ctx.participants`, `ctx.variables`(최종), `ctx.graphHash`, `ctx.hookHash`.
  - 반환: `{ outcome, scores, highlightIds?, templateId?, templateVars? }`
    - `scores`: `{ [slotId]: { delta, total?, reason? } }`
    - `templateId/templateVars`: 배틀로그 렌더에 사용.
    - (선택) 이벤트 태깅에 활용할 `tags?`, `visibility?` 같은 메타 필드 추가 가능.
- 실행/정산 흐름:
  1) 런타임이 매 턴 `turnLog`에 이벤트 push.
  2) 종료 시 `onBattleEnd` 호출 → outcome/scores/highlightIds/templateVars 수집.
  3) `/api/rank/settle` 호출 시 위 결과 + turnLog etag/해시를 함께 전송.

스토리지/전송
- 원본 로그: `turn_log` 테이블/파일에 정규화 이벤트 배열 저장.
- 요약: `summary_payload`에 `outcome/scoreboard/highlightIds/templateId`.
- 렌더된 배틀로그(옵션): 캐시 필드에 저장하되, 재생성을 위해 템플릿/메타를 함께 보관.

편집기 UX 포인트
- 프롬프트-노드: 노드/엣지에 “로그 라벨/하이라이트” 태그를 붙이는 UI.
- 코드 에디터: `runtime.config` 등에 `logTemplates` 블록을 두어 프리셋/변수 매핑 선언.
- 뷰어: 전체/하이라이트/승패 요약 탭, 참여자/타입 필터 제공.

---

## 기본 파이프라인 & 뷰 (현재 구현 기준)

Status: in progress – 텍스트 베틀/랭크 기준으로 1차 구현 완료, 기타 장르/플레이 오버레이는 확장 예정.

### 1. runtime:turn-log → battleLog 변환

- 이벤트 소스:
  - Play / Maker:
    - `CodeEditorOverlayV2`는 `coreRuntime.getCurrentWithPrompt()` / `step()` 호출 결과를 받아
      `runtimeBus.emit('runtime:turn-log', event)` 형태로 턴 이벤트를 발행한다.
  - Rank 메인게임(StartClient):
    - `useStartClientEngine`의 `engine.logs` 배열이 늘어날 때마다 새 항목을
      `runtimeBus.emit('runtime:turn-log', { turn, nodeId, nodeLabel, reason, input, prompt, ui, variables, visibility?, isVisible? })` 로 브리지한다.

- battleLog 정규화:
  - `lib/runtime/battleLogSchema.js`:
    - `normalizeEvent(ev)`:
      - `id`: 없으면 `safeId(type)`로 생성.
      - `type`: 유효한 문자열이면 그대로, 아니면 기본값 `'system'`.
      - `turn/timestamp/speaker/visibility/summary/variables/attachments`를 안전하게 채운 뒤,
        원본 필드를 병합해 돌려준다.
    - `buildBattleLog({ events, participants, outcome, scoreboard, highlightIds, meta })`:
      - `events` 배열을 `normalizeEvent`를 통해 정규화하고,
      - `participants/outcome/scoreboard/highlightIds/meta`를 한 객체로 묶는다.
  - `lib/runtime/battleLogHelpers.js`:
    - `buildLogFromRuntime({ events, participants, outcome, scoreboard, highlightRule, meta })`:
      - `events` → `normalizeEvent` → `buildBattleLog`.
      - `highlightRule`(기본: `{ types: ['score_change','judge','summary'], visibility: 'public' }`)에 따라
        하이라이트 대상 이벤트 id 배열을 생성한다.
    - `normalizeBattleOutcome(raw)`:
      - `onBattleEnd`나 rank 엔진이 돌려준 `{ winners, losers, draw, scores, highlightIds, templateId, templateVars }`
        형태를 안전하게 정규화한다.

- 정산 스크립트:
  - `/api/rank/settle`는 battleLog를 입력으로 받아:
    - `SCORE_SCRIPT_PATH` 또는 기본값 `workspace/score/score-default.js`를 `import` 한 뒤,
    - `scoreFn({ battleLog, participants, meta: { sessionId, gameId } })`를 호출해 `{ scores, winners, losers, draw, highlightIds, meta }` 결과를 얻는다.
    - 스크립트가 없거나 실패하면 `scoreboard/outcome/highlightIds` 등 기본 규칙에 따라 최소한의 result를 만든다.

### 2. /battle-log 기본 뷰에서의 표현 규칙

- API:
  - `pages/api/rank/history.js`:
    - `loadBattleHistoryBySession(sessionId)` 또는 `loadBattleHistoryByGame(gameId)`를 사용해
      `{ battleLog, result, meta }`를 반환한다.
  - `lib/rank/battleHistoryStore.js`:
    - 가능하면 Postgres(`battle_history` 테이블)에 저장/조회, 아니면
      `workspace/score/history/{sessionId}.json` 파일을 사용하는 이중 경로를 제공한다.

- 뷰:
  - `pages/battle-log/[sessionId].jsx`:
    - `events = battleLog.events || []`
    - `highlights = result.highlightIds || battleLog.highlightIds || []`
    - `highlightEvents = events.filter(ev => highlights.includes(ev.id))`
    - 화면 구성:
      1. 상단 헤더: `세션 ID / 게임 ID / createdAt`
      2. 결과 카드: `result.winners` / `result.losers` / `result.draw`
      3. “하이라이트” 섹션:
         - `highlightEvents`를 최근순으로 카드 목록으로 보여준다.
         - 각 카드에는 `턴, type, speaker.name/slotId, summary` 를 요약 텍스트로 사용.
      4. “전체 로그” 섹션:
         - `events` 전체를 같은 카드 스타일로 한 번 더 렌더링한다.
    - 요약 텍스트 규칙:
      - `summary = ev.summary` 가 있으면 우선 사용.
      - 없으면 `ev.prompt` 첫 줄 또는 `nodeLabel/nodeId` 중 하나를 fallback으로 사용.

### 3. Maker가 조정할 수 있는 부분(현재/계획)

- 이미 가능한 부분:
  - `runtime:turn-log` 이벤트에:
    - `summary`: 노드/훅에서 “이 턴을 어떻게 설명할지” 한 줄 요약을 채워 넣으면,
      /battle-log 뷰에서 그대로 사용된다.
    - `type`: `'score_change' | 'judge' | 'summary' | ...` 등을 명시하면,
      `buildLogFromRuntime`의 기본 highlightRule과 결합해 하이라이트 대상이 자동으로 결정된다.
    - `visibility` / `isVisible`:  
      - `visibility: "hidden" | "private" | "invisible" | "internal"` → 기본 뷰에서 숨기고 싶을 때 사용.
      - `visibility: "public" | "party" | "visible" | "shared"` → 기본적으로 표시.
  - `workspace/score/score-default.js` 또는 같은 디렉터리의 커스텀 스크립트:
    - 점수 계산/승패 판정/하이라이트 id를 재정의할 수 있다.
  - `/game/hooks/automation.js`의 `onBattleEnd(ctx)` (랭크 텍스트 배틀 기준):
    - 텍스트 배틀 훅이 `variables.battleLast.battleEnd === true` 가 되는 시점에
      StartClient 가 워크스페이스의 `onBattleEnd(ctx)` 를 한 번 호출한다.
    - `ctx.turnLog`에는 이 세션 동안 축적된 `runtime:turn-log` 이벤트 배열이,
      `ctx.variables`에는 마지막 턴 이후의 변수 스냅샷이,
      `ctx.participants`에는 `rankContext.players` 에서 변환된 참가자 맵이 들어간다.
    - 반환값 `{ outcome, scores, highlightIds, templateId, templateVars }` 는
      `buildLogFromRuntime` 를 거쳐 `battleLog.outcome/scoreboard/highlightIds` 와
      `battleLog.meta.templateId/templateVars` 로 반영되고,
      `/api/rank/settle` + `workspace/score/score-default.js` 에서 그대로 소비된다.

- 향후 확장(계획):
  - `onBattleEnd(ctx)` 호출 범위를 다른 장르/엔진/Play 오버레이로 넓히고,
    템플릿 시스템(`/game/logTemplates/*.json` 등)과 연결해 게임별 맞춤 베틀로그 뷰를 제공.
  - `/game/runtime.config.json` 의 `logTemplates` 블록:
    - 이벤트 타입별/태그별로 어떤 템플릿(타임라인/카드/챕터형)을 사용해야 하는지 선언하고,
    - UI Shell 위젯(`turnTimeline`, `battleSummaryCard` 등)이 이를 해석해 다양한 뷰를 제공하게 하는 방향을 계획 중이다.
