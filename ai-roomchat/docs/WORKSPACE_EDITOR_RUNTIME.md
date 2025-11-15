# Workspace Editor & Runtime Contracts

에디터/런타임/확장 프로그램을 한 축으로 묶기 위한 개발 철학 + 사용부 계약 요약입니다.  
이 문서를 기준으로 코드 구조와 새 기능을 맞춰 갑니다.

---

## 1. 전체 그림

- **목표**: “거의 모든” 멀티플레이 게임을, 브라우저 에디터로 만들고, 같은 메인게임 엔진에서 돌릴 수 있게 한다.
- **핵심 축**:
  - Workspace VFS (파일 기반 계약)
  - Editor 레이어 (파일을 안전하게 수정/저장/테스트)
  - Runtime (파일셋을 해석해 실제 게임을 돌리는 엔진)
  - Extensions (Git, Codex Web, 레퍼런스 데이터 등, 선택적 확장)

에디터와 메인게임은 **“파일 계약”으로만 통신**하는 것이 기본 원칙입니다.

---

## 2. Workspace VFS 계약

하나의 세트(set)는 “파일셋 + 메타”로 보며, 최소 다음 파일들이 핵심 계약입니다.

- 필수 파일
  - `/template.json`
    - Studio/Maker 그래프의 원본 템플릿(JSON).
    - `nodes`, `edges`, `ui`, `ai` 등이 들어갈 수 있음.
  - `/graph/prompt-graph.json`
    - 정규화된 그래프.
    - 구조: `{ nodes: [{id,type,label,...}], edges: [{id,source,target,label}] }`
    - `SyncTemplateToVfs` 가 `/template.json`을 바탕으로 생성/유지.
  - `/game/runtime.config.json`
    - 엔진/모드/턴/역할/매칭 규칙.
    - 예시:
      ```json
      {
        "version": 1,
        "engine": "builtin",
        "mode": "turn",
        "entryNode": "start",
        "roles": ["players", "observers"],
        "durations": [30, 60, 90]
      }
      ```
  - `/game/hooks/automation.js`
    - 런타임 훅 구현.
    - 시그니처:
      ```js
      export function transformPrompt(ctx) { /* string or { prompt, ui } */ }
      export function onUserAction(ctx, input) { /* next id or { next } */ }
      export function selectNext(ctx, neighbors) { /* id */ }
      ```

- 선택 파일
  - `/game/pages/**` — UI/스크립트 페이지.
  - `/context/*.json` — 플레이어/오너 등 컨텍스트 샘플.
  - `/docs/**` — 제작 가이드/레퍼런스.

이 계약을 기준으로 `CodeWorkspaceProvider` 의 `files` 가 구성되고,  
런타임/메인게임은 이 파일셋을 읽어 게임을 실행합니다.

---

## 3. CodeWorkspaceProvider & useWorkspace

단일 진실의 store:

- `files`: 현재 스냅샷 (마지막 저장본, 서버에서 내려온 상태)
- `drafts`: 편집 중 버퍼 (`{ [path]: string }`)
- `dirty`: 파일별 수정 여부
- `savedSig`: 마지막 저장본의 content signature
- `filesForSave`: `files + drafts` 를 합친 “저장용 스냅샷” (헬퍼로 계산)

주요 API (요약):

- 읽기
  - `files`: 스냅샷 조회용 (런타임/프리뷰/도구).
  - `filesForSave`: 저장 직전에 서버로 보낼 전체 파일셋.
  - `inferLang(path)`: Monaco 언어 추론.
  - `isDirty(path)`: 해당 경로가 수정되었는지.

- 쓰기
  - `setDraft(path, content)`
    - 편집 버퍼만 변경, `drafts[path]` 갱신 + dirty 표시.
    - Monaco/에디터는 **편집 중엔 이 API만 호출**.
  - `writeFile(path, content)`
    - `files` 스냅샷 수정용. 템플릿/그래프/도구가 구조를 직접 쓸 때 사용.
  - `saveFile(path)`
    - 로컬에서 해당 파일을 “저장됨” 상태로 표기(dirty false, drafts 제거).
  - `saveFileAndPush(setId, path, overrideContent?)`
    - `filesWithDrafts()` 로 스냅샷을 만든 뒤, 단일 PUT으로 `/api/workspace/sets/:id` 에 저장.
    - `overrideContent` 가 있으면 해당 path의 content를 명시적으로 덮고 저장.
  - `saveAll()` / `saveAllAndPush(setId)`
    - 모든 파일에 대해 위와 동일한 규칙으로 저장.

이 store는 에디터/런타임/확장이 **공유하는 단일 워크스페이스 상태**입니다.

---

## 4. Editor 레이어 (CodeEditorOverlayV2)

`CodeEditorOverlayV2` 는 “공식 코드 에디터 UI” 역할을 합니다.

- 파일 선택/탭/트리
  - `FileTree` + `TabsBar` 로 구현.
  - `useWorkspace().open(path)` / `close(path)` 를 사용.
  - 탭 닫기 시:
    - `isDirty(path)` 이면 “저장/저장 안 함/취소” 다이얼로그.
    - “저장” → `saveFile` + `saveFileAndPush` → `close`.

- Monaco 통합
  - `EditorMonaco`:
    - `value = drafts[activePath] ?? files[activePath].content` 를 전달.
    - `onChange(val)` → `setDraft(activePath, val)`.
    - `onSave` → 현재 버퍼를 `writeFile`/`saveFileAndPush` 로 저장.
    - `currentPath` 를 이용해 **파일 전환 시에만 setValue** 를 호출 (커서 점프 방지).

- 저장/테스트
  - 상단 툴바 “서버 저장”:
    - Maker(그래프/프롬프트 DB) 저장이 있을 경우 → `unifiedSave(setId, filesForSave)` 호출.
    - 워크스페이스만 사용할 경우 → `saveAllAndPush(setId)`.
  - 플레이 오버레이:
    - `PlayOverlayContent` 가 `/template.json`, `/game/runtime.config.json`, `/game/hooks/automation.js` 를 읽어 단일 클라이언트 테스트.

앞으로 다른 라우트에서 코드 편집이 필요하면, 이 오버레이를 띄우는 쪽으로 통일합니다.

---

## 5. Runtime & 메인게임 브리지

런타임/메인게임은 VFS를 이렇게 사용합니다.

- 입력
  - 세트 id: `setId` (예: `84728e...`)
  - 플레이어 컨텍스트: `/context/player.json`, `/context/owner.json` 등.
  - 매칭 결과: 외부 매칭 시스템이 room/slot 정보를 부여.

- 실행
  - 엔진:
    - `/game/runtime.config.json.engine` 이 `"builtin"` 인 경우:
      - 프론트/서버에 내장된 엔진이 `/graph/prompt-graph.json` + `/game/hooks/automation.js` 를 읽고 실행.
    - 향후 `"external"` 등 다른 엔진 타입도 `/docs` 와 함께 추가.
  - 턴/상태:
    - `/game/runtime.config.json` 의 `mode`, `durations`, `roles` 에 따라 `STATE_AND_TURNS.md` 계약에 맞게 동작.

- 출력
  - UI: `/game/pages/**` 기반 JSON/스크립트 UI.
  - 로그/리플레이: 별도 테이블/스토리지에 저장 (VFS 외부).

에디터에서 “메인 게임에서 돌리기” 버튼을 누르면:

1. 워크스페이스를 저장 (`saveAllAndPush(setId)`).
2. 매칭/방 생성 API에 `setId` 를 넘김.
3. 플레이어가 이 `setId` 기반 방에 입장.

---

## 6. Extensions (Git, Codex Web, Reference Packs)

확장 프로그램은 “워크스페이스 위에 얹는 옵션 레이어”입니다.

- 상태 저장
  - 세트별 확장 상태는:
    - `meta.extensions` (workspace set 메타), 또는
    - `/workspace/extensions.json` 같은 전용 파일에 저장.
  - `ExtensionsHost` + `ExtensionInstallModal` 이 이 상태를 읽고/쓰고,  
    코드 에디터 상단 “확장” 드롭다운 아래에 설치된 확장을 노출.

- 예시 확장
  - GitHub Sync
    - PAT, owner/repo/branch 설정은 로컬 스토리지.
    - “현재 `filesForSave` 를 git commit/push” 하는 버튼 제공.
  - Codex Web
    - owner/repo/branch/workspaceId 를 채운 Codex URL 열기.
    - 나중에 Web hook/Actions로 VFS와 round-trip 연동.
  - Reference Packs
    - `/reference_data/**` 를 읽어 샘플 파일셋을 “보기/복사” 용도로 제공.
    - 직접 import 할 때는 `writeFile`/`addFiles` 를 통해 VFS에 주입.

확장은 어디까지나 “도와주는 도구”이고, **실제 게임은 항상 VFS 계약만 따르면** 메인게임에서 실행 가능합니다.

---

## 7. 저장소 (dev vs prod)

현재 이 레포의 `ai-roomchat` 사본은 **개발용 인메모리 저장소**를 사용합니다.

- API
  - `GET/PUT/DELETE /api/workspace/sets/:id`
  - 구현: `ai-roomchat/pages/api/workspace/sets/[id].js`
- 저장소 구현
  - `ai-roomchat/lib/workspace/setsStore.js`
  - 내부에서 `const sets = new Map()` 에 파일셋을 보관하는 구조(서버 프로세스 메모리).
  - 서버가 재시작되면 이 `Map` 내용은 사라집니다.
- 인증
  - Supabase를 통해 “누가 이 세트에 접근할 수 있는지”만 검증합니다.
  - 세트 내용 자체는 아직 Supabase 테이블에 저장하지 않습니다.

실제 프로덕션용 영구 저장은:

- `workspace_sets` 같은 테이블을 Supabase에 만들고,
- `setsStore` 의 `ensure/create/upsert/remove` 가 이 테이블을 읽고/쓰도록 교체하는 단계가 추가로 필요합니다.

이 문서의 나머지 계약(파일 구조, 스토어 API, 에디터/런타임 흐름)은  
**저장소 구현이 인메모리든 DB든 동일하게 유지되는 것을 목표**로 설계되어 있습니다.

---

## 8. 멀티플레이 & 향후 확장

멀티플레이/매칭은 다음 계약을 통해 확장합니다.

- `/game/runtime.config.json` 에 매칭 필드 추가 (예시):
  ```json
  {
    "matchmaking": {
      "mode": "queue",
      "minPlayers": 2,
      "maxPlayers": 8,
      "roles": ["players", "observers"]
    }
  }
  ```
- 매칭/세션 서버는:
  - 이 필드를 읽어 방을 구성하고,
  - 플레이어별 컨텍스트 + setId + role 을 런타임에 전달.

에디터/워크스페이스 관점에서 보면, “매칭 가능 여부” 역시 결국  
`/game/runtime.config.json` + `/graph/prompt-graph.json` + `/game/hooks/automation.js` 의 조합으로 결정됩니다.

---

## 9. 이 문서를 기준으로 할 것들

앞으로 구조/구현을 바꿀 때는:

- 워크스페이스 관련 변경은 **반드시 이 문서에 반영**해서 계약을 유지하고,
- 에디터/메인게임/확장/레퍼런스 데이터는 모두 이 계약을 기준으로 설계합니다.

사용부(게임 제작자) 입장에서는:

- “파일트리의 이 경로들만 지키면, 어떤 게임이든 메인게임에서 멀티플레이로 돌릴 수 있다”
라는 약속을 제공하는 것이 이 문서의 목표입니다.
