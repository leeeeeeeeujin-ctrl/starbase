# UI Schema

파일: `/game/pages/ui/*.json`

노드 타입(예시)

- 레이아웃: `vstack`, `hstack`, `grid(cols, gap)`
- 텍스트/이미지: `text(value, color?, fontSize?, bold?)`, `image(src, alt?, radius?, border?)`
- 입력: `input(name, placeholder?, event='input')`, `textarea(name, rows?, event='input')`, `toggle(name, label?, event='toggle')`, `select(name, options, event='select')`, `slider(name, min, max, step, event='slider')`
- 액션: `button(label, event='click', payload)`
- 기타: `list(items)`, `card(children, padding?)`, `spacer(size)`, `progress(value)`

이벤트 매핑

- 모든 위젯은 `onEvent(name, payload)`로 이벤트를 발생합니다.
- 런타임은 해당 이벤트를 `window.dispatchEvent('runtime:userAction', { detail: { slotId, name, payload }})`로 변환합니다.
- 훅 `onUserAction(ctx, input)`에서 input은 `{ name, value }` 또는 payload로 전달됩니다.

권장 패턴

- 버튼: `{ "type": "button", "label": "Next", "event": "next" }`
- 입력 후 전송: `input(..., event:'player_input')` + 버튼 `send` (훅에서 조건 처리)

