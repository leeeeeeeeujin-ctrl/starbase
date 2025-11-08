# AI 코드 채팅 가이드(에디터)

목적: 에디터의 AI 채팅에 아래 템플릿/규약을 알려, 실행 가능한 변경(파일 추가/수정/이동)으로 이어지게 합니다.

원칙
- 게임 코드만 생성(시스템 권한·키 요청 금지)
- `src/game/index.js` 어댑터 규약 준수: `init/start/stop/dispose`(+ `onInput/resize/update` 선택)
- 레퍼런스 데이터는 `/api/reference/*`에서 가져오기

유용한 요청 템플릿
1) 2D 루프/입력 템플릿 추가
```
src/game/index.js를 다음 요구사항으로 업데이트:
- Arrow 키로 이동하는 플레이어 사각형
- Space로 점프, 중력 적용
- resize()로 캔버스 DPR 반영
```

2) 텍스트 판정/베틀 로직(오케스트레이션 연동)
```
다음 함수를 추가:
- export function onJudgeTurn({ ai, character, target }) { return ai.runPrompt({ template: '...{{character.name}} vs {{target.name}}...', character, audience: ['all'], timeoutMs: 8000 }); }
```

3) 레퍼런스 데이터 로드
```
`lib/game/reference/referenceData.js`의 loadReferenceJSON('character.sample')로 캐릭터 샘플 로딩.
```

참고 문서
- `../../docs/AI_GAME_PROMPTS.md`
- `../../docs/GAME_ADAPTERS.md`
- `../../docs/AI_ORCHESTRATION.md`
