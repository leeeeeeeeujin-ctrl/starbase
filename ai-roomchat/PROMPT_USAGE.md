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
