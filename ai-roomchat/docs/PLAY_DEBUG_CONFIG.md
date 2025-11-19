# Play Overlay Debug Config (planned)

이 문서는 **Play 오버레이 전용 디버그 설정**을 정리한 설계 메모다.  
목표는 “메인 게임 UI는 그대로 두고, 코드 에디터의 Play 화면에서만 켜는 디버그 도구”를 제공하는 것이다.

---

## 1. 저장 위치와 기본 구조

- 워크스페이스 VFS 기준 경로:
  - `/debug/play.json`
- 실제 서버/AI 액션 러너 기준 경로:
  - `workspace/debug/play.json` (현재 sandbox 스코프 규칙에 맞게 workspace 하위로 제한)

예시 스키마(초안):

```json
{
  "promptInspector": true,
  "logAiCalls": true,
  "battleJudgeTrace": true,
  "fakeAudience": false,
  "apiProfile": {
    "id": "default",
    "label": "기본 프로필",
    "description": "로컬 개발용 기본 AI 프로필"
  },
  "players": [
    {
      "id": "hero",
      "characterRef": "hero",
      "name": "도전자 히어로",
      "slot": "p1"
    },
    {
      "id": "rival",
      "characterRef": "rival",
      "name": "라이벌",
      "slot": "p2"
    }
  ],
  "visual": {
    "backgroundImage": "/debug/backgrounds/arena1.png",
    "bgm": "/debug/bgm/theme1.mp3",
    "showScore": true
  }
}
```

이 스키마는 **디버그/에디터 전용**이며, 메인 게임 UI나 프로덕션 런타임 로직은 이 파일을 직접 참조하지 않는다.

---

## 2. Play 오버레이에서의 사용 방식

이 설정은 오직 코드 에디터의 Play 오버레이(`CodeEditorOverlayV2` 내부)에서만 사용한다.

- Maker 편집기(프롬프트‑노드 에디터):
  - 그래프/프롬프트/변수 규칙을 편집하는 저작 환경.
  - 향후 상단 헤더에 “Play” 버튼을 두더라도, 이는 **코드 에디터 + Play 오버레이를 열어주는 단축키** 역할만 한다.
- 코드 에디터 Play 오버레이:
  - 실제 텍스트 배틀 / grid 월드 / 네트워크 / 확장 기능이 모두 여기서 실행된다.
  - `/debug/play.json`을 읽어 “디버그 패널”에 반영한다.

디버그 패널 기본 동작(초안):

- Play 오버레이 상단에 **얇은 바/화살표** 하나만 항상 보이게 두고:
  - 예: `▼ 디버그` / `▲ 숨기기` 형태.
  - 클릭/터치 시 디버그 패널이 상단에서 아래로 슬라이드되어 열린다.
- 패널 안에서는 `/debug/play.json`의 설정에 따라 다음 항목들을 토글/표시한다.

### 2.1 Prompt inspector

- 목적:
  - 현재 런타임에서 **실제 모델에게 전달된 프롬프트**를 한눈에 확인하기 위함.
- 동작:
  - `promptInspector: true`일 때:
    - `transformPrompt(ctx)` 결과(텍스트)를 Play 오버레이가 캡처해서,
    - “이 턴에 사용된 프롬프트” 영역에 표시한다.
  - 추후 확장:
    - 노드 id, battle stage, 변수 일부를 함께 보여주는 작은 요약 블록 추가.

### 2.2 AI 호출 로그 (logAiCalls)

- 목적:
  - `/api/ai-battle-judge` 같은 AI 백엔드 호출을 Play 화면에서 직접 추적하기 위함.
- 동작:
  - `logAiCalls: true`일 때:
    - 요청 시점: 노드 id, route, 프롬프트 길이/요약, API 엔드포인트.
    - 응답 시점: `result`, `battleEnd`, `winner`, 응답 시간(ms).
  - 이 정보는 **Play 디버그 패널 내에서만** 보여주며, 메인 UI에 노출하지 않는다.

### 2.3 Battle judge trace (battleJudgeTrace)

- 목적:
  - `parseAIResponse` 결과와 노드 라우팅(`config.battle.routes`) 사이의 관계를 눈으로 확인.
- 동작:
  - `battleJudgeTrace: true`일 때:
    - 마지막 호출의 `result / battleEnd / winner`와
    - 그 결과가 어느 라우트 키(`on_hero_win`, `on_rival_win`, `on_tie` 등)를 통해 어떤 노드로 이어졌는지
      표 형태로 간단히 보여준다.

### 2.4 Fake audience / 플레이어 구성 (fakeAudience, players)

- 목적:
  - "이번 프롬프트/연출이 다른 플레이어/역할/캐릭터 기준으로 어떻게 보일지"를 가볍게 테스트.
- 동작:
  - `fakeAudience: true`일 때:
    - `/template.json`의 `resources.characters`와 `/debug/play.json`의 `players` 정보를 합쳐,
    - 드롭다운으로 “현재 시점에서의 뷰어(플레이어/캐릭터/역할)”를 선택할 수 있게 한다.
  - 선택된 뷰어 정보는:
    - prompt inspector에서 “이 뷰어 기준 프롬프트 미리보기”,
    - (필요 시) 텍스트 UI에서 audience 필터링을 시뮬레이션하는 용도로만 사용한다.

---

## 3. 메인 게임 UI와의 분리 원칙

- 메인 게임 UI(`MainGameMobileUI` 등)는:
  - `/debug/play.json`을 직접 읽지 않는다.
  - 디버그 패널이 켜져 있어도, 일반 사용자에게는 **일관된 게임 플레이 경험**만 제공해야 한다.
- Play 오버레이의 디버그 패널은:
  - 오로지 개발자/제작자/AI 코드 채팅이 사용할 도구로 취급한다.
  - 프로덕션 빌드에서도 남길 수는 있지만, 기본값은 `promptInspector/logAiCalls` 등을 `false`로 두어야 한다.

이 문서는 설계 초안이며, 실제 구현은 `CodeEditorOverlayV2`와 관련 훅/컴포넌트에서 단계적으로 진행된다.

