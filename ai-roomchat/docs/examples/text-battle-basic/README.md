# Text Battle Basic Example

이 폴더는 **프롬프트 노드 = 장소/아레나**로 쓰는 간단한 텍스트 배틀 예시를 담고 있습니다.  
실제로 사용하려면 여기 있는 파일들을 **워크스페이스 루트에 같은 경로로 복사**해야 합니다.

타겟 경로 (워크스페이스 VFS 기준):

- `/template.json`
- `/graph/prompt-graph.json`
- `/game/runtime.config.json`
- `/game/hooks/automation.js`
- `/game/ui.shell.json` (선택) – 메인 게임 / 플래이에서 공통으로 사용할 UI 셸 설정

## 1. 개념 요약

- 각 **노드**는 배틀 상의 한 “상황/장소”입니다.
  - 예: `opening`, `mid_round`, `judge`, `rematch`, `end`.
- 각 노드의 `config.battle`에는:
  - 이번 노드에서 싸우는 **진영/캐릭터(sides)**,
  - 결과에 따라 어느 노드로 이동할지에 대한 **routes**,
  - 프롬프트를 조립할 때 참고할 **promptProfile** 정보가 들어갑니다.
- `/game/hooks/automation.js`에서는:
  - `transformPrompt(ctx)`로 “이번 턴에 어떤 프롬프트를 보낼지”를 만들고,
  - `onUserAction(ctx, input)` 또는 `selectNext(ctx, neighbors)`로 “어느 노드로 이동할지”를 결정합니다.

이 예시는 **자동 판정/승패 로직**을 완전히 구현한 것은 아니고,
“프롬프트를 장소처럼 쓰고, 노드의 설정에 따라 흐름을 바꾸는 틀”을 보여주는 최소 샘플입니다.

## 2. 파일 설명

### 2.1 `/template.json`

- 캐릭터/리소스 정의:
  - `hero`와 `rival` 두 캐릭터의 이름/설명/간단 스탯을 담고 있습니다.
- UI 쪽에서는 이 정보를 사용해 캐릭터 카드나 프로필을 렌더링할 수 있습니다.

### 2.2 `/graph/prompt-graph.json`

- 노드:
  - `opening` – 오프닝 인사/소개.
  - `mid_round` – 본격적인 공방.
  - `judge` – 판정/승패 결정.
  - `rematch` – 재도전 여부를 묻는 노드.
  - `end` – 배틀 종료.
- 각 노드에는 선택적으로 `config.battle` 블록이 있으며:
  - `sides`: 이 노드에 참여하는 진영 id/캐릭터 참조 id.
  - `routes`: 예시용 라우트 키 (`on_hero_win`, `on_rival_win`, `on_tie`, `on_rematch`, `on_end` 등).
  - `promptProfile`: 프롬프트를 조립할 때 참고할 간단한 힌트(톤, 이전 턴 로그 포함 여부 등).

### 2.3 `/game/runtime.config.json`

- 빌트인 텍스트 런타임을 위한 최소 설정:
  - `entryNode`: 그래프 시작 노드 id (`"opening"`).
  - `hookTimeoutMs`: 훅 실행 타임아웃.
  - `roles`: 모델 프롬프트에서 사용할 기본 역할 배열(예시값).

실제 어떤 LLM/엔드포인트를 쓸지는 별도의 오케스트레이션/백엔드 설정에 따라 달라질 수 있습니다.

### 2.4 `/game/hooks/automation.js`

- 이 예시에서는:
  - `transformPrompt(ctx)`:
    - 현재 노드의 `config.battle`과 `ctx.variables`를 사용해
      “이번 턴에 모델에게 보낼” 한글 설명 프롬프트를 문자열로 만들어 반환합니다.
  - `onUserAction(ctx, input)`:
    - 사용자가 입력한 텍스트가 `"hero_win"`, `"rival_win"`, `"tie"`, `"rematch"`, `"end"` 등일 때,
      노드의 `config.battle.routes`를 참고해 다음 노드 id를 반환합니다.
    - 이 부분은 나중에 **모델 응답을 파싱해서 자동으로 승패를 결정**하는 로직으로 교체할 수 있습니다.

핵심은:

- “노드에 적힌 설정(config.battle)에 따라 프롬프트를 만들고,
   같은 설정을 사용해 다음 노드를 고른다”는 패턴을 확립하는 것에 있습니다.

### 2.5 `/game/ui.shell.json` (선택)

- 이 파일이 존재하면, 랭크 메인게임/플래이에서 공통으로 사용하는 **UI 셸 레이아웃**을 정의합니다.
- 이 예시에서는:
  - `widgets` 패널을 활성화하고,
  - 다음과 같은 위젯들을 배치합니다.
    - `heroCard` (`source: "rank.viewer"`): 현재 플레이어(뷰어)의 캐릭터 카드.
    - `badge` (`source: "variables.battleResult"`): 턴 결과 토큰(`hero_win`, `rival_win`, `tie` 등)을 요약해 보여주는 배지.
    - `chatLog`: 공통 턴 로그(`runtime:turn-log` 스트림)를 간단히 보여주는 패널.
    - `textBlock` (`source: "variables.battleLast.narrative"`): 직전 턴의 서술(ex. 판정 결과 요약)을 짧게 보여주는 블록.
  - 각 위젯에는 간단한 스타일 토큰(`padding`, `radius`, `tone`, `density` 등)이 붙어 있어,
    동일 위젯을 카드형/리스트형 등으로 재사용할 수 있습니다.

복사 시 이 파일은 워크스페이스 루트의 `/game/ui.shell.json` 으로 들어가야 합니다.
