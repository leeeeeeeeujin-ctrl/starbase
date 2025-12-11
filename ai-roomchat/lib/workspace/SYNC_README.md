# Maker Graph ↔ Workspace/Runtime 동기화

## 구현 완료 (2025-12-11)

### ✅ 완료된 작업

1. **Studio → workspace 단방향 sync 구현**
   - `lib/workspace/syncPromptGraphToVfs.js` 생성
   - Supabase의 prompt graph (sets/slots/bridges) 읽어서 워크스페이스 파일 생성
   - `/graph/prompt-graph.json` - 노드와 엣지 정보
   - `/game/runtime.config.json.entryNode` - 시작 슬롯 자동 설정

2. **WorkspaceFrame 통합**
   - `components/workspace/WorkspaceFrame.jsx` 수정
   - 세트 로드 시 `syncPromptGraphToVfs()` 자동 실행
   - 200 OK (기존 세트)와 404 (새 세트) 모두 처리

3. **coreRuntime fallback 강화**
   - `lib/runtime/coreRuntime.js` 수정
   - entryNode 없을 때 경고 로그 추가
   - fallback은 안전장치로 유지 (첫 번째 노드 사용)

### 🔄 부분 완료

**SyncTemplateToVfs와의 역할 분리**
- `/template.json` 편집 시: `SyncTemplateToVfs`가 `/graph` 재생성 (기존 동작 유지)
- maker graph 편집 시: `syncPromptGraphToVfs`가 Supabase → VFS sync
- 충돌 방지: WorkspaceFrame 로드 시점에만 Supabase → VFS 단방향 적용

### 📋 다음 단계

1. **테스트**
   - starter pack 텍스트 배틀 세트 로드 확인
   - maker graph에서 노드/엣지 추가 후 Play 실행
   - entryNode 자동 설정 검증

2. **문서화**
   - `WORKSPACE_EDITOR_RUNTIME.md` 2.x 섹션에 동기화 규칙 추가
   - Studio 수정 vs 워크스페이스 직접 수정 차이 명확화

## 사용 방법

### 자동 동기화 (기본)

Maker 페이지에서 세트를 열면 자동으로 Supabase 그래프가 워크스페이스에 동기화됩니다:

```javascript
// WorkspaceFrame이 자동으로 호출
const files = await syncPromptGraphToVfs(initialFiles, setId);
```

### 수동 동기화 (필요 시)

```javascript
import { syncPromptGraphToVfs } from '@/lib/workspace/syncPromptGraphToVfs';

// 현재 파일 배열과 세트 ID 제공
const updatedFiles = await syncPromptGraphToVfs(currentFiles, setId);
```

### 생성되는 파일

1. **`/graph/prompt-graph.json`**
```json
{
  "nodes": [
    {
      "id": "n123",
      "type": "ai",
      "label": "시작 프롬프트...",
      "data": { "slotId": 123, "slotNo": 1, ... }
    }
  ],
  "edges": [
    {
      "id": "e456",
      "source": "n123",
      "target": "n124",
      "label": "턴≥3 | 확률50%",
      "data": { "bridgeId": 456, ... }
    }
  ]
}
```

2. **`/game/runtime.config.json.entryNode`**
```json
{
  "engine": "builtin",
  "mode": "turn",
  "entryNode": "n123",  // ← 시작 슬롯 자동 설정
  ...
}
```

## 동작 흐름

```
┌─────────────────────────────────────────────────┐
│ Maker/Studio 화면에서 세트 열기                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ WorkspaceFrame: GET /api/workspace/sets/:id     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ syncPromptGraphToVfs(files, id)                 │
│  ├─ fetchPromptGraph(id)                        │
│  │   └─ Supabase query (slots + bridges)       │
│  ├─ buildGraphJson({ slots, bridges })          │
│  │   └─ nodes + edges 생성                      │
│  ├─ /graph/prompt-graph.json 생성/업데이트      │
│  └─ /game/runtime.config.json.entryNode 설정    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ CodeWorkspaceProvider: 워크스페이스 초기화        │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ PlayOverlay: coreRuntime 실행                    │
│  └─ /graph + entryNode 기반으로 게임 진행        │
└─────────────────────────────────────────────────┘
```

## 주의사항

### SyncTemplateToVfs와의 관계

- **`/template.json` 편집 시**: `SyncTemplateToVfs`가 `/graph` 재생성 (기존 동작)
- **maker graph 편집 시**: `syncPromptGraphToVfs`가 Supabase → VFS 동기화
- 두 sync가 충돌하지 않도록 WorkspaceFrame **로드 시점**에만 Supabase sync 실행
- 이후 편집은 각자의 역할 영역에서만 동작

### entryNode fallback

`coreRuntime`은 entryNode가 없거나 유효하지 않을 때 첫 번째 노드를 사용합니다:

```javascript
// lib/runtime/coreRuntime.js
let currentId = cfg.entryNode || null;
if (!currentId || !nodesById.has(currentId)) {
  const first = nodesById.keys().next();
  currentId = first && !first.done ? first.value : null;
  if (currentId && process.env.NODE_ENV !== 'production') {
    console.warn('[coreRuntime] entryNode missing, using fallback:', currentId);
  }
}
```

정상 동작 시에는 `syncPromptGraphToVfs`가 항상 유효한 entryNode를 설정하므로 이 fallback은 실행되지 않습니다.

## 트러블슈팅

### 그래프가 동기화되지 않음

1. 브라우저 콘솔에서 `[syncPromptGraphToVfs]` 로그 확인
2. Supabase 연결 확인: `prompt_sets`, `prompt_slots`, `prompt_bridges` 테이블 접근 가능한지
3. 세트 ID가 유효한지 확인

### entryNode가 설정되지 않음

1. Supabase에서 `is_start = true`인 슬롯이 있는지 확인
2. WorkspaceFrame 로드 로그에서 `startSlotId` 값 확인
3. `/game/runtime.config.json` 파일 내용 확인

### Play에서 그래프가 작동하지 않음

1. `/graph/prompt-graph.json` 파일이 생성되었는지 확인
2. 노드와 엣지가 올바르게 생성되었는지 확인
3. coreRuntime 콘솔 경고 메시지 확인 (`entryNode missing` 등)
