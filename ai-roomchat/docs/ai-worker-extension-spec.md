# VS Code AI Worker Extension Spec

## 목적

Manager AI가 여러 Worker AI를 병렬로 실행할 수 있도록 하는 VS Code Extension

## 아키텍처

```
Manager AI (GitHub Copilot Chat)
    ↓ (호출)
VS Code Extension Command
    ↓ (병렬 실행)
├─ Worker 1: vscode.lm.sendRequest (파일 A 작업)
├─ Worker 2: vscode.lm.sendRequest (파일 B 작업)
└─ Worker 3: vscode.lm.sendRequest (테스트 작성)
    ↓ (결과 수집)
Manager AI에게 리포트 반환
```

## 구현 방법

### Extension Command

```javascript
// extension.js
vscode.commands.registerCommand('ai-worker-pool.execute', async tasks => {
  const [model] = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: 'gpt-4o',
  });

  // 병렬 실행
  const results = await Promise.all(tasks.map(task => executeWorker(model, task)));

  return results;
});
```

### Manager AI가 사용하는 방법

```
/executeWorkers [
  { "task": "Write tests for matching.js" },
  { "task": "Review security of match.js" },
  { "task": "Optimize queue.js" }
]
```

## 장점

1. **병렬 처리**: 3개 작업을 동시에 실행
2. **VS Code 네이티브**: Copilot API 직접 사용
3. **Manager AI 통합**: 챗에서 바로 호출 가능

## 필요한 작업

1. VS Code Extension 프로젝트 생성
2. `vscode.lm` API 사용 권한 설정
3. Worker pool 로직 구현
4. Extension 배포 (로컬 또는 Marketplace)

## 예상 사용 시나리오

**사용자**: "matching.js에 테스트 추가하고, security review하고, 최적화 제안해줘"

**Manager AI (나)**:

```
작업을 3개로 분할했습니다:
1. 테스트 작성
2. 보안 리뷰
3. 최적화 제안

/executeWorkers [...]  // Extension 호출
```

**3개 Worker AI**: (동시 실행)

- Worker 1: 테스트 코드 생성 ✅
- Worker 2: 보안 이슈 발견 ✅
- Worker 3: 최적화 제안 ✅

**Manager AI**:

```
결과를 검토했습니다:
- 테스트: 5개 추가, coverage 95%
- 보안: SQL injection 가능성 발견, 수정 제안
- 최적화: O(n²) → O(n log n) 개선 가능

수정사항을 적용할까요?
```

## 구현 우선순위

1. ✅ AI Worker Pool 스크립트 (완료)
2. 🔲 VS Code Extension 기본 구조
3. 🔲 vscode.lm API 통합
4. 🔲 Manager AI 통합
