# 프롬프트 변수 파이프라인 개요

이 문서는 프롬프트 제작기와 랭크 게임 등록 탭에서 정의한 변수 규칙이 실제 매칭·전투 흐름에서
어떻게 사용되는지 단계별로 정리합니다.

## 1. 세트 및 슬롯 정의
- 프롬프트 제작기에서 저장한 슬롯은 `prompt_slots` 테이블에 보관되며, 각 슬롯은 전역/로컬 변수
  규칙(`var_rules_global`, `var_rules_local`)을 JSON 형태로 유지합니다.【F:components/rank/StartClient/engine/rules.js†L1-L65】
- `createNodeFromSlot`는 슬롯을 노드 그래프로 변환하면서 매뉴얼 변수와 활성 변수 지시를
  `options.manual_vars_*`, `options.active_vars_*`에 정규화합니다.【F:components/rank/StartClient/engine/rules.js†L31-L70】

## 2. 게임 등록과 번들 로딩
- 랭크 게임 등록 시 선택한 프롬프트 세트 ID가 `rank_games.prompt_set_id`에 연결되고,
  매칭 클라이언트는 이 값을 기반으로 슬롯·브리지 목록을 불러옵니다.【F:components/rank/StartClient/engine/loadGameBundle.js†L1-L84】
- 번들 로딩 이후 `useStartClientEngine`은 `graph.nodes`에 슬롯 노드를 보관하고, 전투 시작 시
  `makeNodePrompt`로 해당 노드 템플릿을 컴파일합니다.【F:components/rank/StartClient/useStartClientEngine.js†L200-L360】

## 3. 템플릿 컴파일과 변수 주입
- `compileTemplate`는 슬롯 템플릿의 플레이스홀더를 교체하고, 위에서 정규화한 변수 규칙을
  `[변수/규칙]` 섹션으로 이어붙입니다.【F:lib/promptEngine/template.js†L1-L52】
- 동일한 함수가 변수 규칙 문자열을 메타데이터(`meta.variableRules`)로 되돌려 UI와 히스토리에서
  별도로 참조할 수 있게 했습니다.【F:lib/promptEngine/template.js†L24-L48】

## 4. 전투 진행과 히스토리 기록
- `useStartClientEngine`의 `advanceTurn` 로직은 `makeNodePrompt` 결과를 사용해 AI 프롬프트를 생성하고,
  변수 규칙 문자열을 히스토리 항목과 턴 로그에 저장합니다.【F:components/rank/StartClient/useStartClientEngine.js†L430-L680】
- `LogsPanel`은 각 턴 카드에 “변수 규칙 안내” 섹션을 추가해 플레이어가 현재 적용 중인 조건을
  즉시 확인할 수 있게 합니다.【F:components/rank/StartClient/LogsPanel.js†L1-L80】

## 5. AI 호출과 공유 세션 상태
- `advanceTurn`에서 준비한 시스템 프롬프트는 `[PROMPT]` 로그와 함께 `history` 객체에 쌓이고,
  `/api/rank/run-turn` 호출 시 그대로 전달되어 대화형 AI가 변수 지시를 이해하도록 합니다.【F:components/rank/StartClient/useStartClientEngine.js†L480-L620】
- 같은 대기열에서 합의한 턴 대기 시간은 `rank.start.turnTimer` 세션 키로 저장되어 모든 참가자가
  동일한 간격으로 다음 프롬프트를 보게 됩니다.【F:components/rank/GameStartModeModal.js†L1-L318】

이 파이프라인을 통해 프롬프트 제작기에서 입력한 변수 조건이 매칭 진입부터 실제 AI 호출까지
일관되게 유지됩니다.
