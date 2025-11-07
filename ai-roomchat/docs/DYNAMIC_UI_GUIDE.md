# Dynamic UI Override & Creation Guide

이 문서는 에디터에서 거의 모든 메인게임 UI를 파일로 정의/교체/확장하는 방법을 설명합니다.

## 핵심 개념
- `template.json`의 `ui.overrides` 맵을 통해 **기존 슬롯**을 교체할 수 있습니다.
- 슬롯은 `DynamicSlot` 컴포넌트로 감싼 영역이며, 값이 없으면 기본 UI가 그대로 노출됩니다.
- 슬롯 값은 두 가지 타입을 지원합니다:
  - `{ "type": "ui", "path": "/game/pages/ui/yourView.json" }` — JSON UI 스키마
  - `{ "type": "script", "path": "/game/pages/scripts/yourView.js" }` — JS 스크립트로 동적 생성

## 지원 슬롯 목록
| Slot ID    | 기본 내용                                    | 위치 |
|------------|----------------------------------------------|------|
| `topBar`   | 카운트다운 / Next Bar (`CountdownNextBar`)    | 최상단 |
| `mainTop`  | 메인 게임 패널 (AI 메인게임 UI)               | 좌측 상단 |
| `history`  | 히스토리 패널                                | 좌측 하단 |
| `chat`     | 채팅 패널                                    | 우측 상단 |
| `mainGame` | 메인게임 패널 내부 헤더                      | 메인게임 내부 상단 헤더 |
| `footer`   | (기본 없음) 하단 추가 공간                   | 페이지 맨 아래 |

## template.json 예시
```jsonc
{
  "ui": {
    "overrides": {
      "topBar": { "type": "ui", "path": "/game/pages/ui/topBar.json" },
      "chat": { "type": "script", "path": "/game/pages/scripts/customChat.js" },
      "footer": { "type": "ui", "path": "/game/pages/ui/footer.json" }
    }
  }
}
```

## UI 스키마 형식 (간단)
`/game/pages/ui/*.json`:
```json
{
  "type": "vstack",
  "gap": 8,
  "children": [
    { "type": "text", "value": "커스텀 TopBar", "fontSize": 15, "bold": true },
    { "type": "button", "label": "Ping", "event": "ping", "payload": { "msg": "hello" } }
  ]
}
```

지원되는 기본 요소 타입(예시):
- `vstack|hstack` (children, gap)
- `text` (value, bold, fontSize, color)
- `button` (label, event, payload)
- `image` (src, w, h, alt)
- `card` (children)

## Script View 형식
`/game/pages/scripts/customChat.js`:
```js
export function render(ctx){
  // ctx.files 로 현재 VFS 접근 가능
  const schema = {
    type: 'vstack', gap: 6, children: [
      { type:'text', value:'🔧 Script 기반 Chat Override', fontSize:15, bold:true },
      { type:'button', label:'리소스 보기', event:'showResources' }
    ]
  };
  const handlers = {
    showResources(){ console.log('files', Object.keys(ctx.files||{})); }
  };
  return { schema, handlers };
}
```

버튼을 클릭하면 `event` 값으로 핸들러 호출 (예: `showResources`).

## AI 코드 어시스턴트용 가이드
에이전트가 UI를 생성/수정하려면 다음을 따르세요:
1. 대상 슬롯 식별: `topBar`, `chat`, `history` 등.
2. 필요한 경우 새 파일 생성 액션(create)으로 `/game/pages/ui/*.json` 또는 `/game/pages/scripts/*.js` 작성.
3. `template.json`의 `ui.overrides`에 write/merge 액션으로 슬롯 등록.
4. 변경 사항이 많다면 단일 work 플랜에서 `actions` 배열로 묶기.
5. 200KB 초과 파일은 금지; UI 스키마는 10KB 이내 권장.
6. 이미지/자산 필요 시 `/assets/uploads` 경로 사용(WebP 변환).

예시 액션 세트(JSON):
```json
{
  "mode": "work",
  "actions": [
    { "type": "create", "path": "/game/pages/ui/topBar.json", "content": "{\n  \"type\": \"vstack\", \n  \"gap\": 6, \n  \"children\": [ { \"type\": \"text\", \"value\": \"TopBar Updated\", \"bold\": true } ]\n}" },
    { "type": "write", "path": "/template.json", "content": "{\n  \"ui\": { \n    \"overrides\": { \n      \"topBar\": { \"type\": \"ui\", \"path\": \"/game/pages/ui/topBar.json\" } \n    } \n  }\n}" }
  ]
}
```

## 슬롯 추가 제안 (향후)
- `rightBar`, `overlayModal`, `systemAlerts` 등 확장 가능
- 템플릿에 `ui.dynamic.views`를 둬 순서/조건 기반 렌더링 규칙도 도입 가능

## 제한 / 주의
- 스크립트 뷰는 `new Function`으로 실행되므로 외부 네트워크 호출/글로벌 오염 금지
- 너무 큰 JSON/스크립트는 성능 저하 → 분할 권장
- 핫 리로드: 현재는 파일 수정 후 화면 리렌더 트리거(저장 시 자동)만 존재; 향후 이벤트 기반 개선 예정

---
필요한 추가 슬롯이나 요소 타입 있으면 `template.json` 예시와 함께 요청해 주세요.
