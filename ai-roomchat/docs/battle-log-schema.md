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
