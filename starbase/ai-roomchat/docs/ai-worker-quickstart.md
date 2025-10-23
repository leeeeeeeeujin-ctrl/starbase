# AI Worker Pool - Quick Start

## 즉시 테스트 (OpenAI API)

### 1. API 키 설정

```powershell
$env:OPENAI_API_KEY="sk-your-api-key"
```

### 2. 작업 정의

`scripts/tasks.json` 생성:

```json
[
  {
    "description": "분석 작업",
    "files": ["lib/rank/matching.js"],
    "instruction": "이 파일의 복잡도를 분석하고 개선점 제안"
  }
]
```

### 3. 실행

```powershell
npm run ai-workers scripts/tasks.json
```

### 4. 결과 확인

`reports/ai-workers-report.json`

---

## Extension 개발 시작 (Day 1)

### 필수 도구 설치

```powershell
npm install -g yo generator-code
```

### Extension 생성

```powershell
cd c:\Users\yujin\Documents
yo code
```

선택:

- New Extension (TypeScript)
- Name: ai-worker-pool
- Identifier: ai-worker-pool
- Description: Parallel AI worker execution for VS Code
- Initialize git: Yes

### 개발 시작

```powershell
cd ai-worker-pool
code .
```

---

## 다음 단계

1. ✅ OpenAI 프로토타입 테스트
2. 🔲 Extension 기본 구조
3. 🔲 Copilot API 통합
4. 🔲 Worker Pool 엔진
5. 🔲 UI 구현
