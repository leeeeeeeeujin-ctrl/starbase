# Capability: ui.text

> 텍스트/채팅 기반 UI로 core.graph + core.hooks 결과를 보여주는 레이어.
> Status: phase 1 spec complete (reference_data 매핑 + MainGameMobileUI 연동까지 반영).

---

## 1. Workspace 계약

- **역할**: “텍스트 게임” / “대화형 UI” 구성을 위한 최소 설정을 제공.
- **권장 파일**:
  - `/game/ui/text.config.json` (선택적)
    - 예시 필드:
      - `layout`: 텍스트 UI 레이아웃 힌트 (헤더/캐릭터/게임로그/입력창 배치 등).
      - `theme`: 색상/폰트 크기 등.
      - `systemMessagePrefix`: 시스템 메시지 접두어.
- **훅 연계**:
  - `core.hooks`의 `transformPrompt(ctx)`가 텍스트 UI에 직접 영향을 준다.
    - 문자열 반환 → 그대로 시스템 메시지로 사용.
    - `{ prompt, ui }` 반환 → `prompt`는 텍스트, `ui`는 레이아웃/컴포넌트 힌트로 해석 가능.

---

## 2. 런타임 계약

- **표준 이벤트 흐름**:
  - 런타임(coreRuntime) → UI:
    - `system:message` (string)
      - 현재 노드/프롬프트 텍스트를 전달.
  - UI → 런타임(coreRuntime):
    - `player:chat` (`{ text: string }`)
      - 플레이어 입력을 prompt-graph 런타임의 `step({ reason: 'user_action', input })`으로 전달.
    - `turn:next` (no payload)
      - 다음 노드로 자동 전진(`reason: 'auto'`).
- **핵심 구현**:
  - `ai-roomchat/components/game/MainGameMobileUI.jsx`
    - `runtimeBus.on('system:message', msg)`:
      - `gameChat` 상태에 `{ role: 'system', text: msg }` 추가.
    - `sendChat()`:
      - 입력 텍스트를 `player:chat` 이벤트로 `runtimeBus.emit('player:chat', { text })`에 전달.
    - `triggerNext()`:
      - `runtimeBus.emit('turn:next')` + 필요시 `onNext()` 호출.
  - `ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx` (`PlayOverlayContent`):
    - `createCoreRuntime(...)`로 생성한 런타임에서:
      - 초기 진입 시 `getCurrentWithPrompt()` 결과의 `prompt`를 `system:message`로 발행.
      - `step({ reason: 'auto' })` / `step({ reason: 'user_action', input })` 결과의 `prompt`를 `system:message`로 발행.

---

## 3. Text Game Engine 연계

- 참고 엔진: `ai-roomchat/docs/TEXT_GAME_ENGINE.md`
  - `lib/game/text/TextSceneEngine.js`:
    - `"nodes"`, `"text"`, `"choices"`, `"effects"`와 `{{var}}` 치환을 지원하는 텍스트 엔진.
  - core.graph + core.hooks + ui.text 조합으로 이 엔진을 감싸는 방식:
    - `/graph/prompt-graph.json` 노드 id ↔ TextSceneEngine의 노드 id를 일치시킨다.
    - `transformPrompt(ctx)` 안에서:
      - `files['/game/text/script.json']` 같은 별도 스크립트를 읽어 TextSceneEngine 인스턴스를 만든 뒤,
      - 현재 그래프 노드 id / 변수 상태를 기반으로 `engine.current()`에서 텍스트/선택지를 계산.
    - 반환:
      - `return { prompt: engine.current().text, ui: { choices: engine.current().choices } };`
    - 이후 `MainGameMobileUI`에서 `ui.choices`를 해석해 “선택지 UI”를 렌더하는 방향으로 확장 가능.

---

## 4. reference_data 매핑

텍스트/채팅 UI는 다음 레퍼런스를 기반으로 설계된다.

- **채팅/텍스트 UI 패턴**  
  - `reference_data/chat-master/`
    - 메시지 스트림을 append하는 패턴, 시스템/유저 역할 구분, 스크롤 관리 등을 참고.
- **상태/턴 관리**  
  - `ai-roomchat/docs/STATE_AND_TURNS.md`
    - “턴 단위 진행 + 텍스트 로그” 구조를 정리해 둔 문서.
  - core.runtimeConfig의 `durations` + timing adapter(`timingTurns`)와 결합해,
    “턴 제한시간이 끝나면 자동으로 `turn:next`” 같은 규칙을 만들 수 있다.
- **텍스트 기반 게임 엔진**  
  - `ai-roomchat/docs/TEXT_GAME_ENGINE.md`
  - `reference_data/rot.js-master/` (로그라이크 메시지 로그 패턴)
  - `reference_data/jest-main/` / `ava-main/` 등은 “step별 스냅샷/assert 스타일”을 참고용으로만 사용.

1단계에서는 ui.text를 “coreRuntime ↔ MainGameMobileUI ↔ runtimeBus”로 정의된 텍스트 UI 계약으로
명확히 정리해 두고, TextSceneEngine 같은 구체 엔진과의 실제 어댑터 구현은 이후 단계에서 진행한다.
