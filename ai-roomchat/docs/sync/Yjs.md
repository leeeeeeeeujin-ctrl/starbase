# Sync — Yjs

이 가이드는 Yjs를 이용해 상태 동기화를 적용하는 방법을 설명합니다. UI 변경 없이 파일과 훅으로 조합합니다.

구성 파일

- `/game/adapters.config.json`

예시

```
{
  "sync": { "id": "yjs" }
}
```

동작 모델

- 문서 생성: `createYDoc()` → `doc`
- 맵/배열 등 공유 타입을 선택해 상태를 저장
- 훅에서 `ctx.files/config`와 Yjs 상태를 조합해 로직 처리(예: 변수 저장)

클라이언트 어댑터

- 코드: `lib/runtime/adapters/syncYjs.js`
- 의존성: `yjs`

주의

- 전송 계층(websocket provider)은 프로젝트에서 별도로 제공해야 합니다.
- 문서 수명은 세트 수명과 동일하게 관리하세요.

