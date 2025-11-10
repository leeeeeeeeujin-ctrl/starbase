# Runtime Capability Contracts

이 문서는 장르 이름이 아닌, 조립 가능한 "기능 단위" 계약을 설명합니다. 에디터/실행기는 다음 계약을 조합해 어떤 게임도 구성 가능합니다.

핵심 파일

- `/graph/prompt-graph.json` — 노드/엣지 흐름
- `/game/hooks/automation.js` — 훅: `transformPrompt`, `onUserAction`, `selectNext`
- `/game/runtime.config.json` — 엔트리/턴/역할 등 설정

핵심 계약

- `core.graph`: 그래프 정의 (필수)
- `core.hooks`: 훅 실행 (필수)
- `core.runtimeConfig`: 런타임 구성 (권장)

선택 계약(예)

- `ui.text`: 텍스트 UI로 프롬프트/선택지 표현
- `ui.canvas2d`: 2D 캔버스 렌더러 어댑터 사용
- `ui.webgl3d`: WebGL/Three.js 기반 3D 렌더러
- `input.keyboard`/`input.gamepad`: 입력을 훅 `onUserAction`으로 전달
- `grid.tilemap`/`ai.pathfinding`: 격자/경로탐색 로직
- `physics.basic`: 물리/충돌 (렌더러 어댑터 필요)
- `network.socketio`/`network.colyseus`: 룸/실시간 메시징
- `crdt.yjs`: 협업 상태 동기화
- `worker.offthread`: 워커 기반 연산 분리
- `timing.turns`: 턴/타임아웃
- `storage.snapshot`: 상태 저장/복구

API

- `GET /api/runtime/capability-contracts` — 사용 가능한 계약 목록(설명/필요 파일/훅/참조 링크)
- `GET /api/refroot/...` — 루트 `reference_data/` 브라우즈(읽기 전용)

가이드라인

1) 최소 구성: `core.graph` + `core.hooks` + `core.runtimeConfig`
2) 훅 작성은 순수 함수로, 외부 네트워크 의존 제거(웹 워커 샌드박스/타임아웃 적용)
3) 렌더러/입력/네트워킹/CRDT 등은 어댑터 계약으로 연결(추가 문서 예정)

예시 훅 스켈레톤

```js
// /game/hooks/automation.js
export function transformPrompt(ctx) {
  const label = String(ctx?.node?.label || '');
  return label; // 또는 { prompt, ui }
}

export function onUserAction(ctx, input) {
  // 입력을 보고 다음 노드 id 또는 { next } 반환
}

export function selectNext(ctx, neighbors) {
  // neighbors: [{ id, label, type }]
  return neighbors?.[0]?.id ?? null;
}
```

참고 링크

- 각 계약 항목의 `references` 필드를 확인하세요. 예: PixiJS/Phaser/Three.js/Socket.IO/Yjs 등.
