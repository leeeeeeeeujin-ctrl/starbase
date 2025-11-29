# Rank 메인게임 재구성 계획 (Play ↔ Rank 공통 엔진)

이 문서는 기존 래거시 메인게임(StartClient)을 폐기하고, **플래이와 동일한 엔진/쉘을 사용하는 새 메인게임**을 어떻게 설계·구현할지에 대한 구현 계획이다.

## 1. 목표

- 플래이(CodeEditorOverlay의 Play)와 랭크 메인게임이 **동일한 게임 엔진과 UI 쉘**을 사용한다.
- 차이는 오직:
  - 랭크 쪽에만 존재하는 매칭/세션/점수 정산 레이어,
  - 호스트용 최소 제어(나가기, 세션 중단, 치명적 오류 표시) 정도만 둔다.
- 코드를 추가할 때:
  - “플래이 엔진 → 메인게임 엔진” 두 군데를 따로 수정하지 않도록,
  - 가능한 한 `/game/*` 워크스페이스 파일과 공통 컴포넌트(GameShell, LogsPanel, MainGameMobileUI)만 건드리면 되게 만든다.

## 2. 레이어 구조

### 2.1 매칭/세션 레이어 (Rank layer)

- 위치(대상 파일):
  - `components/rank/StartClient/useStartClientEngine.js`
  - `pages/rank/[id]/start.js`, `pages/rank/[id]/match-ready.js`
- 책임:
  - `rank_match_queue`, `rank_rooms`, `rank_sessions` 와 통신해 매칭·방·세션을 생성/종료.
  - 현재 시청자(viewer)의 `ownerId`, `heroId`, `role`, `sessionId`, `roomId`, `realtimeMode`, `dropInEnabled` 를 포함한 `rankContext` 생성.
  - 텍스트 런타임 게임의 경우, 매칭 성사 시 **자동으로 세션 시작**.
- 비책임:
  - 프롬프트 그래프/훅 실행, 턴 엔진, 게임 로직, 메인 게임 UI 배치.

### 2.2 엔진 레이어 (coreRuntime)

- 위치:
  - `lib/runtime/coreRuntime.js`
  - 워크스페이스 파일 `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`.
- 책임:
  - 플래이와 동일하게 `createCoreRuntime({ graph, config, hooks, files, initialVariables })` 로 엔진 생성.
  - `initialVariables.rank = rankContext` 를 주입해 훅에서 랭크/세션 정보를 사용할 수 있게 한다.
  - `runtimeBus` 를 통해 텍스트 출력, 로그, world 상태 등을 GameShell에 전달.

### 2.3 쉘/뷰 레이어 (GameShell + MainGameMobileUI + LogsPanel)

- 위치:
  - `components/game/GameShell.jsx`
  - `components/game/MainGameMobileUI.jsx`
  - `components/rank/StartClient/LogsPanel.js`
- 입력:
  - `runtimeBus`, `runtimeFeatures`, `shellConfig`, `mode`, `viewerHero`.
- 책임:
  - 공통 게임 화면 골격:
    - 상단 제목/모드 표시,
    - 가운데 메인 게임 영역(MainGameMobileUI – 텍스트 배틀, 그리드 등),
    - 우측(or 하단) 로그 영역(턴 로그, AI 히스토리, 플레이어 히스토리, 실시간 이벤트).
  - `/game/ui.shell.json` 또는 rank workspace 의 `ui_shell` 로 패널 on/off 및 레이아웃 제어.
- 비책임:
  - “랭크 매치 / 참가자 0/0 / 모드 선택” 등 StartClient 전용 고정 UI.

## 3. 코드 에디터 ↔ 메인게임 관계

### 3.1 워크스페이스가 단일 진실

- Maker에서 편집하는 파일:
  - `/template.json`
  - `/graph/prompt-graph.json`
  - `/game/runtime.config.json`
  - `/game/hooks/automation.js`
  - `/game/ui.shell.json`
  - `/game/roles.rank.json`
- 게임 등록 시:
  - 위 파일들을 `save_rank_game_workspace(p_game_id, p_workspace)` RPC로 `rank_game_workspaces` 에 저장.
  - 메인게임은 매번 이 스냅샷만 사용해 실행된다.

### 3.2 StartClient에서의 사용 방식

1. `gameId` 로 `/api/rank/game-workspace` 호출 → `{ template, graph, runtime_config, hooks_source, ui_shell }`.
2. 스냅샷을 사용해:
   - `CodeWorkspaceProvider` 를 읽기 전용 모드로 감싸고,
   - `createCoreRuntime({ graph, config: runtime_config, hooks: hooks_source, files })` 로 엔진 생성,
   - `GameShell` 에 `shellConfig={ui_shell}` 와 `mode="rank"`, `viewerHero` 전달.
3. 플래이에서 레이아웃/패널/훅을 변경하면, **재등록 후** 메인게임에도 그대로 반영된다.

## 4. 래거시 메인게임 정리 방침

### 4.1 완전히 제거할 것들

- StartClient 안의 다음 요소들은 모두 제거 대상:
  - 상단 “랭크 매치 / 메인 게임 / 참가자 0/0” 헤더 및 3개의 대형 카드.
  - “Mode: Rank Solo / Quick Match / Drop-in Now” 패널.
  - 자체 텍스트 엔진(mainGameMachine, matchFlow 기반 텍스트 배틀 로직).
  - 비실시간 전용 진행 카드(턴 제한, 보너스 설명 등) 중 GameShell로 이관하지 않을 것들.

### 4.2 개념만 보존할 것들

- 다음 기능은 개념은 유지하되 GameShell/LogsPanel 쪽 공용 컴포넌트로 이관:
  - 턴 로그 / AI 히스토리 / 플레이어 히스토리:
    - `LogsPanel` + `ui.shell.panels` 로 on/off 제어.
    - 이후 훅 기반 `transformLogs(ctx, events)` 계약 추가 예정.
  - 캐릭터/참가자 카드:
    - 캐릭터 페이지의 카드 스타일을 재사용하는 `viewerHero` 카드로 구성.

## 5. 단계별 구현 순서 (요약)

1. **안전 축소 단계**
   - `textRuntimeEnabled === true` 인 게임에서:
     - 기존 StartClient 헤더/요약/모드 패널은 렌더링하지 않는다.
     - GameShell + LogsPanel + 최소 세션 컨트롤만 사용.
2. **새 엔진/쉘 연결**
   - Rank StartClient에서:
     - rank workspace 스냅샷을 읽어 `coreRuntime` + `GameShell` 을 생성.
     - `initialVariables.rank` 를 설정해 훅에서 랭크 정보를 사용할 수 있게 한다.
3. **래거시 코드 제거**
   - 사용되지 않는 옛 컴포넌트와 엔진 로직을 삭제하거나 `_legacy` 네임스페이스로 이동.
4. **확장 포인트 추가**
   - `/game/ui.shell.json` 스키마를 확장해 패널/카드/로그 옵션을 수용.
   - 훅 계약(`transformLogs`, `transformHeader`, `transformViewerCard` 등)을 정의해
     텍스트 배틀 외 장르도 동일한 GameShell을 쓸 수 있게 한다.

이 계획을 기준으로, 메인게임 구현은 “코드 에디터에서 정의한 워크스페이스 + 랭크 매칭 레이어”만을 의존하도록 유지한다.  
즉, 메인게임은 **플래이 엔진의 랭크 뷰어**라는 관점을 끝까지 유지하는 것이 핵심이다.

