# Prompt-maker & Runtime 통합 청사진

이 문서는 `ai-roomchat` 프로젝트에 "프롬프트 제작기(prompt-maker) + 런타임 통합" 기능을 설계하고 구현하는 청사진입니다. 목표는 사용자가 코드(프롬프트-노드 형식)로 프롬프트를 작성·버전관리하고, 런타임(메인 게임 흐름)에서 이 템플릿을 렌더해 AI(Gemini 등)에 요청하여 게임 로직에 반영하는 것입니다. 또한 편집 경험은 코드 편집과 블록(노드) 편집을 모두 지원하도록 설계합니다.

> 현재 정책/운영: OAuth/Gemini 인증은 팀에서 처리(사용자별 인증/토큰 제공). 우선 클라이언트에서 AI를 직접 호출하는 흐름을 권장하며, 서버는 저장·검증·감사·샌드박스 역할을 담당합니다.

---

## 1. 핵심 목표

- 템플릿(프롬프트)을 코드(텍스트 또는 노드 JSON)로 편집·버전관리
- 템플릿 렌더러(입력 데이터 바인딩, 조건/반복 포함) 제공
- Provider abstraction을 통해 Gemini/OpenAI/Mock 지원
- 런타임(게임 턴)에서 템플릿을 선택·렌더·실행하고 결과를 저장
- 에디터는 코드 편집 + 블록(시각적 노드) 편집 전환 가능
- 모바일 UX 대응: 경량 에디터 또는 WebView 기반

---

## 2. 데이터 모델(권장)

SQL 스타일(간단):

- prompts
  - id TEXT PRIMARY KEY
  - name TEXT
  - body TEXT    -- 텍스트 템플릿 또는 node-JSON 직렬화
  - format TEXT  -- 'template' | 'node-json'
  - metadata JSONB
  - version INTEGER
  - created_by TEXT
  - created_at TIMESTAMP

- prompt_versions (선택)
  - id, prompt_id, body, metadata, version, created_at

- prompt_runs
  - id TEXT PRIMARY KEY
  - prompt_id TEXT
  - version INTEGER
  - input JSONB
  - rendered_prompt TEXT
  - provider TEXT
  - provider_response JSONB
  - status TEXT
  - created_at TIMESTAMP

- code_snapshots (옵션)
  - id, owner, files JSONB, commit_message, created_at

설명: `prompt_runs`는 재현성과 감사(audit)를 위해 모든 입력·렌더·응답을 기록합니다.

---

## 3. API 계약(권장)

- POST /api/prompts
  - body: { name, body, format, metadata }
  - returns: { id, version }

- GET /api/prompts/:id
  - returns: { id, name, body, format, metadata, version }

- POST /api/prompts/:id/render
  - body: { input: JSON }
  - behavior: 서버/렌더러가 `body`와 `input`을 바인딩하여 텍스트를 반환
  - returns: { rendered: string, warnings?:[], tokensEstimate?:number }

- POST /api/prompts/:id/run
  - body: { input: JSON, provider?: string (e.g., 'mock'|'gemini') }
  - behavior: 렌더→provider call(클라이언트 대리 또는 서버에서)→prompt_runs 기록
  - returns: { runId, providerResponse }

- GET /api/prompts/:id/runs
  - returns: [ prompt_runs ]

권장: `render`는 UI 미리보기용으로, `run`은 실제 provider 호출(로그 생성)용입니다.

---

## 4. Provider abstraction

인터페이스:

callProvider({ provider, prompt, instructions?, opts? }) -> Promise<{ text, raw, usage }>

- Adapters:
  - mock: 테스트/CI용 간단 응답
  - gemini: 팀에서 제공하는 OAuth/CLI 흐름을 사용하는 adapter(혹은 클라이언트가 직접 호출)
  - openai-like: 필요 시

운영 방식(권장):
- 기본: 클라이언트가 사용자의 Gemini 자격증명으로 AI를 직접 호출 → 응답을 클라이언트가 받아 미리보기/승인 후 서버에 저장
- 대리 호출(옵션): 사용자가 원치 않거나 모바일에서 OAuth 흐름을 못 쓰면 서버가 대리 호출(요금/부하 고려)

---

## 5. 프롬프트 표현 방법(사양 초안)

두 가지 표현 형식 지원:

1) 텍스트 템플릿
  - Mustache/Handlebars 스타일(예: `{{player.name}}`) 또는 간단한 템플릿 엔진
  - 확장: `{{#if condition}}...{{/if}}`, `{{#each items}}...{{/each}}` (필요시)

2) Node-JSON (프롬프트-노드)
  - JSON AST: nodes = [ { id, type:'text'|'var'|'if'|'loop'|'include', props: {...}, children: [...] } ]
  - 장점: 시각 블록 에디터에서 직렬화/역직렬화 용이
  - 예시:
    {
      "type":"root",
      "children":[
        {"type":"text","text":"Play as: "},
        {"type":"var","name":"player.role"},
        {"type":"if","cond":"player.score>100","children":[{"type":"text","text":" (veteran)"}]} 
      ]
    }

렌더러는 Node-JSON을 순회하여 텍스트 생성.

보안: 렌더 중 사용자 입력을 안전하게 이스케이프하고, 저장 전 금지 패턴(예: API keys) 검사.

---

## 6. 에디터 UX(권장)

- 편집 모드 전환: [코드 텍스트] <-> [노드 블록 편집]
- 코드 에디터 옵션:
  - 빠른 MVP: `textarea` 또는 `react-codemirror`(CodeMirror 6)
  - 고급: `Monaco`(desktop-first)
- 기능: 치환표(available variables list), 샘플 입력란, 미리보기(render), 'AI 도와줘' 버튼(클라이언트 Gemini 호출 / mock)
- 변경 적용 정책: AI가 제안한 변경은 patch/diff로 받아 사용자 확인 후 적용

모바일 UX:
- WebView로 반응형 에디터 제공 권장(빠르게 배포 가능)
- 모바일 전용 편집기는 추후

---

## 7. 통합(메인 게임)

- 게임 턴에서 프롬프트 실행 시나리오:
  1. 게임 서버가 `prompt id`와 `input`(game state, turn history, player data)을 건넴
  2. 서버(또는 클라이언트)가 `render` → 텍스트
  3. provider 호출 → 응답
  4. `prompt_runs`에 기록 및 `turns` 또는 `rank_turns`에 응답 저장
  5. 후속 게임 로직(점수, 이벤트)에 응답 반영

- 권장: 운영 환경에서는 prompt_runs의 audit trail을 항상 남기기

---

## 8. 보안·검증·운영

- 저장 시 자동 검사: 비밀(키/토큰) 패턴, PII 감지, 스크립트 삽입 탐지
- 샌드박스 검증: 서버에서 저장되기 전 샘플 입력으로 안전성 검사(옵션)
- 액세스 제어: 누가 프롬프트를 만들고 실행할 수 있는지(권한 층)
- 비용/쿼터: 사용자가 직접 호출(각자 quota) 또는 서버 프록시(팀 책임)

---

## 9. 테스트 전략

- 단위: 렌더러(모든 노드 타입, 누락 변수, 이스케이프), provider mock
- 통합: 저장→render→mock provider run→prompt_runs 기록 검증
- E2E: 게임 턴 흐름에 프롬프트 연결(경량 시뮬레이터 사용)

---

## 10. 로깅·모니터링

- 이벤트: prompt.created, prompt.updated, prompt.run.started, prompt.run.finished, prompt.run.failed
- 메트릭: runs/sec, avg latency(provider), error rate
- 알림: provider 실패 급증 시 알림

---

## 11. 구현 로드맵(권장 단계별 작업)

1) 문서화(현재 단계) — 설계 확정
2) 백엔드 스키마 + 렌더 API
   - 파일: `pages/api/prompts/*`
   - 테스트: 렌더러 단위 테스트
3) UI(코드 편집기) — 빠른 MVP: CodeMirror
   - 미리보기, 샘플 입력, 저장
4) mock provider + `/api/prompts/:id/run` 엔드포인트
   - prompt_runs 기록
5) 게임 턴 통합(비허용 코드 차단 포함)
6) Gemini 연동(팀에서 제공하는 OAuth/CLI 흐름과 통합)
7) 블록 에디터(노드 편집기)
8) 모바일 WebView 테스트 및 최적화

각 단계가 끝날 때마다 문서(이 파일)에 변경 사항과 운영 가이드(예: 필터 규칙)를 업데이트하세요.

---

## 12. 실행 첫 단계(권장, 제가 바로 할 수 있는 작업)
1. repo에 청사진(이 파일)을 추가했습니다(현재 파일).
2. 다음으로 제가 바로 만들 수 있는 산출물(원하시면 진행합니다):
   - DB 마이그레이션 SQL (간단 테이블 생성)
   - `/pages/api/prompts/*` 기본 스켈레톤(POST/GET/render/run)
   - `lib/promptRenderer.js`(렌더러 기본 구현)
   - 간단한 React 페이지 `pages/prompts/[id]/edit.js`(CodeMirror 포함 기본 UI)
   - mock provider 서버 로직 및 Jest 단위 테스트

원하시면 위 항목 중 첫 번째(마이그레이션 + API 스켈레톤 + 렌더러 단위테스트)를 바로 생성하겠습니다. 어떤 작업부터 시작할지 알려주세요.

---

## 부록: 샘플 템플릿(노드 JSON)

{
  "type": "root",
  "children": [
    {"type":"text","text":"You are the game master.\n"},
    {"type":"text","text":"Player: "},
    {"type":"var","name":"player.name"},
    {"type":"if","cond":"player.score > 100","children":[{"type":"text","text":" — veteran"}]} 
  ]
}

---

끝으로: 이 문서는 살아있는 문서로, 구현 진행 상황·결정·보안 규칙을 여기다 기록해 주세요. 원하시면 이번 청사진 기반으로 즉시 API 스켈레톤을 생성하겠습니다.
