# PROMPT_USAGE (초안)

이 문서는 기존 프롬프트셋을 변경하지 않고도 로컬 개발/테스트 허브에서 재사용하는 방법을 설명합니다.

간단 요약

- 템플릿은 `{{slot0.name}}`, `{{history}}`, `{{pick:opt1|opt2}}` 등 표기법을 사용합니다.
- `ai-roomchat/lib/promptEngine`의 `makeNodePrompt`와 `compileTemplate`을 사용해 템플릿을 컴파일하세요.

샘플 사용

- CLI: `node scripts/make-sample-prompt.js --template "안녕 {{slot0.name}}"`

권장 슬롯 매핑

- 슬롯은 0 기반 인덱스(`slot0`, `slot1`)를 권장합니다.
- 슬롯 객체 예: `{ name: '용사 아린', role: 'attack' }`

테스트 팁

- 랜덤 요소(`{{pick:}}`)는 테스트 재현을 위해 주의하세요.
- 긴 `history`는 `--history`로 전달하거나 미리 잘라서 사용하세요.

성능/안전

- 프로덕션에서 실제 LLM을 호출하기 전, `scripts/run-game-hub.js` 같은 PoC로 로컬에서 동작을 확인하세요.

---

## AI Code Chat 응답 규약 (schema v3)

AI 코드 채팅은 작업(JSON)과 설명(텍스트)을 분리해야 하며, 작업 JSON은 반드시 명시적 마커로 감쌉니다.

- 작업 JSON 마커(택1):
	- `<<PLAN>>` ... `<<ENDPLAN>>` (권장)
	- `===BEGIN:PLAN===` ... `===END:PLAN===`
	- `---PLAN-START---` ... `---PLAN-END---`

- JSON 스키마(v3):
	- `mode`: `"chat" | "work"`
	- `message?`: 요약/설명 텍스트(한국어, 간결)
	- `questions?`: 후속 질문 배열
	- `actions?`: 파일 작업 배열
		- 항목: `{ type: "create|write|delete|rename|read", path: "/path", content?, from?, to? }`
	- `steps?`: 복합 단계 배열(각 단계는 mode/message/actions 포함 가능)
	- `autoContinue?`: 신뢰 모드에서 후속 호출 여부
	- `autoMax?`: 신뢰 모드 연속 호출 최대 횟수(1..10), 미제공 시 기본 2
	- `followup?`: 다음 턴 사용자 입력으로 사용할 제안 문자열

- 작성 규칙:
	- 설명/요약/질문은 마커 밖(텍스트)으로, 작업은 마커 안(JSON)으로만 작성
	- 외부 URL 이미지 제안 금지, 미디어는 .webp만 사용
	- 워크스페이스 내부 경로만: `/template.json`, `/graph/**`, `/game/**`, `/components/**`, `/pages/**`, `/styles/**`, `/utils/**` 등

- 예시(권장):

설명 요약 텍스트...

```
<<PLAN>>
{
	"mode": "work",
	"message": "UI 기본 모듈 추가 및 엔트리 노드 지정",
	"actions": [
		{ "type": "write", "path": "/template.json", "content": "{...}" },
		{ "type": "write", "path": "/game/runtime.config.json", "content": "{...}" }
	],
	"autoContinue": true,
	"autoMax": 3,
	"followup": "그래프 유효성 검사를 실행하세요"
}
<<ENDPLAN>>
```

앱은 마커를 우선적으로 파싱합니다. 마커가 누락된 경우에도 회복 시도를 하지만, 신뢰성 보장을 위해 마커 사용을 강력 권장합니다.
