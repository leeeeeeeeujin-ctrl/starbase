# 프롬프트 저장 테스트 시나리오

## 테스트 목적
프롬프트-노드 에디터에서 수정한 내용이 제대로 저장되고, 코드 에디터와 동기화되는지 확인

## 테스트 절차

### 1단계: 초기 상태 확인
1. 브라우저 새로고침 (Ctrl+Shift+R)
2. F12 콘솔 열기
3. 메이커 페이지 진입
4. 콘솔에서 `[useMakerEditorLoader] loadGraph called` 로그 확인
   - 예상: 초기 로드 시 1회만 나타남

### 2단계: 프롬프트 수정
1. 비주얼 노드 카드 클릭
2. 우측 패널에서 "프롬프트 내용" 필드 찾기
3. 텍스트 수정 (예: "TEST-123" 추가)
4. 콘솔 확인:
   ```
   [MakerEditorPanel] Monaco onChange
   [MakerEditorPanel] setNodes result
   ```
   - 예상: 각 키 입력마다 로그 출력
   - 확인사항: `updatedNodeTemplate`에 "TEST-123" 포함되는지

### 3단계: nodes→templateText 동기화 확인
1. 텍스트 수정 후 200ms 대기
2. 콘솔 확인:
   ```
   [MakerEditor] syncing nodes→templateText
   ```
   - 예상: debounce 후 1회 출력
   - 확인사항: `templates` 배열에 수정된 내용 포함되는지

### 4단계: 저장
1. 저장 버튼 클릭
2. 콘솔 확인:
   ```
   [useMakerEditorPersistence] saveAll start
   ```
   - 예상: 저장 시작 로그 출력
   - 확인사항: `nodes` 배열에 "TEST-123" 포함되는지

### 5단계: 페이지 새로고침 후 확인
1. 브라우저 새로고침 (Ctrl+R)
2. 같은 노드 클릭
3. 프롬프트 내용에 "TEST-123"가 여전히 있는지 확인
   - 예상: 수정사항 유지됨

### 6단계: 코드 에디터 동기화 확인
1. 코드 에디터 버튼 클릭
2. `/graph/prompt-graph.json` 파일 열기
3. 수정한 노드의 `data.template`에 "TEST-123" 포함되는지 확인
   - 예상: 즉시 반영됨

## 예상 로그 순서

```
[초기 로드]
[useMakerEditorLoader] loadGraph called { setId: ..., slotCount: 2 }

[텍스트 수정]
[MakerEditorPanel] Monaco onChange { selectedNodeId: "n_xxx", newValue: "TEST-123..." }
[MakerEditorPanel] setNodes result { nodeCount: 2, updatedNodeTemplate: "TEST-123..." }

[debounce 후]
[MakerEditor] syncing nodes→templateText { nodeCount: 2, templates: ["TEST-123..."] }

[저장]
[useMakerEditorPersistence] saveAll start { nodeCount: 2, nodes: [{template: "TEST-123..."}] }
[MakerEditor] 저장 완료
```

## 문제 발생 시 체크리스트

### 문제: onChange 로그가 안 나타남
- 원인: 코드 변경이 브라우저에 반영 안 됨
- 해결: .next 폴더 삭제 후 재시작

### 문제: setNodes 로그는 나타나지만 저장 시 옛날 데이터
- 원인: nodes 상태 업데이트가 saveAll까지 전달 안 됨
- 확인: `[useMakerEditorPersistence] saveAll start`의 nodes 배열 확인

### 문제: 저장은 되지만 새로고침 후 사라짐
- 원인: Supabase 저장 실패 또는 loadGraph가 다시 덮어씀
- 확인: `[useMakerEditorLoader] loadGraph called`가 저장 직후 다시 호출되는지

### 문제: 코드 에디터에 반영 안 됨
- 원인: `/graph/prompt-graph.json` 파일이 업데이트 안 됨
- 확인: MakerEditor.js의 "Real-time sync to workspace" useEffect 실행 여부
