# Capability: core.runtimeConfig

> 게임 런타임의 엔트리 노드, 역할, 턴/시간 구조를 정의하는 설정.
> Status: phase 1 spec complete (reference_data 매핑 + builtin runtime 연동까지 반영).

---

## 1. Workspace 계약

- **역할**: core.graph, core.hooks와 함께 “이 그래프를 어떻게 실행할지”를 결정.
- **필수 파일**:
  - `/game/runtime.config.json`
    - 권장 스키마(요약):
      - `version: number` – 설정 버전
      - `entryNode: string | null` – 시작 노드 id (없으면 그래프의 첫 노드 등 기본 규칙 사용)
      - `roles: string[]` – 참여자 역할 (`players`, `observers` 등)
      - `durations?: number[]` – 턴별 제한시간 배열 (초 단위)
      - `mode?: 'turn' | 'realtime'` – 기본 실행 모드 (없으면 `durations` 유무로 추론)
      - `ai?: { model: string, [key: string]: any }` – AI 모델/옵션 메타
      - `hookTimeoutMs?: number` – 훅 호출 타임아웃(ms 단위, 기본 500ms)

---

## 2. 런타임 계약

- **주요 런타임 모듈**:
  - `ai-roomchat/lib/runtime/coreRuntime.js`
    - `createCoreRuntime({ graph, config, hooks, files })`에서 `config`를 읽어:
      - `entryNode` → 초기 `currentId` 결정.
      - `roles` → `HookContext.activeRole` 계산에 사용 (현재는 첫 번째 역할 사용).
      - `hookTimeoutMs` (또는 `hookTimeout`) → `callHookWithTimeout`에 넘길 타임아웃 ms 결정.
    - 훅 호출 시:
      - `callHookWithTimeout(() => hooks.onUserAction(ctx, input), config.hookTimeoutMs)`
      - `callHookWithTimeout(() => hooks.selectNext(ctx, neighbors), config.hookTimeoutMs)`
      - `callHookWithTimeout(() => hooks.transformPrompt(ctx), config.hookTimeoutMs)`
- **턴/시간 구성**:
  - 실제 턴 타이머/카운트다운은 `timing.turns` capability와 adapter에서 담당하지만,
  - core.runtimeConfig는 최소한 다음 정보를 갖고 있어야 한다:
    - 한 턴의 기본 시간 (또는 턴별 시간 배열).
    - 턴이 끝난 후 어떤 정책으로 `turn:next`를 발생시킬지에 대한 힌트(예: `autoAdvance: true`).

---

## 3. Play overlay 연동

- 구현 파일: `ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx`
  - `PlayOverlayContent`에서:
    - `/game/runtime.config.json`을 `cfg`로 파싱하고:
      - `engine = cfg.engine || 'builtin'`
      - `mode = cfg.mode || (cfg.durations ? 'turn' : 'realtime')`
    - builtin 엔진인 경우:
      - `createCoreRuntime({ graph, config: cfg, hooks, files })`에 그대로 전달.
      - 이후 `MainGameMobileUI`에 `runtimeConfig={cfg}`로 전달(추후 UI/adapter가 참고 가능).

---

## 4. reference_data 매핑

core.runtimeConfig는 “게임 엔진의 룰/설정 파일”들과 대응된다.

- **matchmaking / 게임 모드 설정**  
  - `ai-roomchat/docs/match-mode-structure.md`  
  - `ai-roomchat/docs/matchmaking-schema-reference.md`  
  - 사용 아이디어:
    - 매치 모드/라운드가 어떻게 정의되는지 참고해,
      `/game/runtime.config.json`에 `modes`, `rounds`, `voteThreshold` 같은 필드를 확장.
- **타이머/턴 구조**  
  - `ai-roomchat/docs/STATE_AND_TURNS.md`  
  - Adapter:
    - `ai-roomchat/lib/runtime/adapters/timingTurns.js` (`createTurnTimer`)  
  - 사용 아이디어:
    - `durations` 배열을 그대로 `createTurnTimer`에 넘겨 “턴 타이머”를 구성.
    - 타이머가 `onTimeout`에서 `turn:next` 이벤트를 발생시키도록 연결.
- **엔진별 설정 파일 예시**  
  - `reference_data/open-match2-main/` – 매치/티켓/프로필 설정 구조.
  - `reference_data/engine-main/`, `reference_data/phaser-master/`, `reference_data/godot-master/` 등에서
    “게임 모드/씬 설정” 패턴을 참고해 `/game/runtime.config.json` 필드 설계에 활용.

1단계에서는 이 레퍼런스를 직접 adapter 코드에 연결하지 않고,  
“어떤 설정 개념을 runtime.config로 가져올지”를 문서로 먼저 확정하는 데 집중한다.
