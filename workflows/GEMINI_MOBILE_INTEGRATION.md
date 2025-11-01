# Gemini 모바일 통합 — 아키텍처 및 PoC 계획

작성일: 2025-11-01

목표
- 모바일(앱) 클라이언트에서 Gemini CLI/Provider 기능을 안전하고 비용-효율적으로 제공한다.
- 서버가 과도한 모델 호출 부담을 지지 않으면서도, 민감한 키나 권한을 유출하지 않는다.
- 실행 가능한 PoC(프록시 + 토큰 발급 + 샌드박스 실행 경로)를 제공하여 이후 에디터/블록코딩 연동에 사용한다.

핵심 아이디어(요약)
- 모바일 → 보호된 프록시(our-proxy) → Provider(예: Gemini) 흐름.
- 프록시는 단순히 요청을 전달하는 역할이 아니라 다음을 담당한다:
  - 단회성/단기 유효 토큰 발급 및 검증
  - 요청 무결성 검사(HMAC 서명)
  - 요청 크기/리소스 제한, 난독화(필요시)
  - 감사(요청/응답 메타데이터 기록)
- 실제 모델 호출(또는 비용이 큰 작업)은 허가된 런너(온프레/자체 인프라) 또는 외부 공급자에 위임.

가정
- 프로젝트는 이미 Express 기반 proxy PoC(`ai-roomchat/proxy/server.js`)와 샘플 클라이언트를 보유.
- SUPABASE 같은 외부 스토리지를 백업/아티팩트로 사용 중.
- 프로덕션급 `SUPABASE_SERVICE_ROLE_KEY` 등 민감키는 보호된 GitHub Environment에 보관 예정.

보안 원칙
1. 최소권한: 모바일에 절대 서비스-레벨 키를 노출하지 않음.
2. 단기 토큰: 프록시가 발급하는 토큰은 TTL(예: 60s) 및 사용 제한(예: 1회) 적용.
3. 서명 검증: 모바일 클라이언트는 요청을 HMAC 서명(또는 JWT)으로 보호. 프록시는 서명·nonce·타임스탬프 확인.
4. 감사 로깅: 요청 ID, 클라이언트 ID, IP, 토큰 ID, 리소스 크기 등 기록(보호된 로그저장소).
5. 자원 제한: 요청 크기, 최대 토큰 당 요청 수, 동시 실행 제한을 강제.

주요 컴포넌트
1) Mobile client
   - 역할: 사용자 입력 → 요청 생성 → HMAC/JWT로 서명 → 프록시에 전달
   - 책임: 사용자 인증(예: 앱 계정), UI, 로컬 sanity checks (길이, 금지어)

2) Proxy (our-proxy)
   - 엔드포인트: `/token` (POST, 인증된 client로부터 토큰 발급), `/v1/gemini` (POST, 서명된 요청을 받아 Provider에 전달)
   - 보안: 발급 토큰(권한 범위), nonce DB(간단한 Redis), rate-limiter, request size limit
   - 감사: structured logs + optional upload to Supabase/Audit table

3) Provider Adapter
   - 프록시 내부 또는 분리된 서비스로 구현. 실제 Provider 호출(예: OpenAI/Gemini). 응답 후 프록시는 결과를 전달.

4) Sandbox / Runner (옵션)
   - 사용자 코드가 포함된 복잡한 작업은 샌드박스에서 실행(예: WASM/ephemeral container).
   - 프록시는 샌드박스 작업을 예약하고 결과만 반환.

토큰/인증 모델 (권장)
- Client 인증(앱 로그인)을 전제로 `client_id`를 발급.
- `/token` 엔드포인트는 client_id + client_secret(앱서버 저장) 또는 앱 인증을 받아 단기 `capability_token`을 반환.
- `capability_token`은 다음을 포함
  - token_id
  - client_id
  - allowed_scopes (예: prompt:read, prompt:exec)
  - expiry (예: 1m)
  - signature (HMAC using server key)

PoC 단계 (단계별 실행 계획)
단계 0 — 준비 (작업 소요: 0.5d)
 - 현재 `ai-roomchat/proxy/server.js`와 `ai-roomchat/scripts/gemini_client_sample.js`를 리뷰.
 - 필요한 env: PROXY_SIGNING_KEY, TOKEN_TTL, REDIS_URL(선택)

단계 1 — 토큰 발급 엔드포인트 완성 (1d)
 - `/token` 구현: client 인증 → 단기 capability token 반환.
 - nonce/토큰 저장소(메모리 또는 Redis로 PoC).
 - 단위 테스트: 토큰 발급/검증 경로.

단계 2 — 서명 검증 및 요청 제어 (1d)
 - `/v1/gemini`에서 HMAC 서명 검증: client_id, nonce, timestamp, body
 - 적용: 크기 제한, rate limiting(간단한 in-memory leaky-bucket PoC), nonce 재사용 거부
 - 로그: 요청 메타데이터를 `logs/gemini-proxy.log`에 구조화된 JSON으로 저장

단계 3 — Provider adapter 연결 (1d)
 - mock provider(현재 PoC) 외 실제 adapter 인터페이스 추가
 - Provider 호출에 대한 timeout, retry 정책, cost-metering hooks

단계 4 — Sandbox 연동 (옵션, 2d)
 - 요청이 코드 실행(템플릿 render / small code)일 경우 sandbox에서 실행
 - PoC sandbox: WASM (fast, client-side) 또는 ephemeral Docker (server-side)

단계 5 — 클라이언트 샘플 개선 + 문서(0.5d)
 - 샘플 모바일 client (React Native / Web fallback) 요청 예시 추가
 - 보안 가이드(토큰 보관, 재발급 정책)

단계 6 — 간단한 E2E 테스트 (0.5d)
 - 토큰 발급 → 서명된 요청 → proxy → provider(mock) → 응답 경로 검증

단계 7 — 배포 및 운영 체크리스트 (0.5d)
 - PRODUCTION environment 시크릿, service-role 키 등록 안내 템플릿(PR)
 - 롤아웃 절차(점진적 트래픽 분배), 모니터링 항목 정의

보안/운영 체크리스트(간단)
- PROXY_SIGNING_KEY는 절대 클라이언트에 노출 금지. GitHub production secret으로 등록.
- Token TTL은 짧게 유지(권장 30–120초)
- Nonce 저장은 반드시 서버 측에서 관리(Replay 방지)
- 요청 크기 한도(예: 32kB)와 총 토큰 소비 제한
- 민감 데이터 필터링(PII 탐지) 및 금지어 필터 적용
- Structured logging + audit export to Supabase/Audit table

PoC 산출물(단기)
- `workflows/GEMINI_MOBILE_INTEGRATION.md` (이 문서)
- Proxy hardening PR: `ai-roomchat/proxy/server.js` 확장(토큰 발급, nonce, rate-limit)
- Client sample: `ai-roomchat/scripts/gemini_client_sample.js` 보완
- E2E test: `ai-roomchat/tests/proxy/e2e.test.js` (Jest 기반)

필요한 시크릿/인프라
- PROXY_SIGNING_KEY (HMAC key)
- REDIS_URL (권장, nonce/ratelimit)
- PRODUCTION: SUPABASE_SERVICE_ROLE_KEY (이미 runbook에서 요구)

테스트 케이스(간단)
1) `/token` 정상 발급
2) 만료된 토큰 사용 시 401
3) 동일 nonce 재사용 시 거부
4) oversized request시 413
5) provider timeout시 502 응답

진행 방식 및 우선순위(권장)
1. 토큰 모델 및 `/token` API 구현 — 보안의 핵심. (우선순위 높음)
2. 서명/nonce 검증과 rate-limiting — 공격 표면 축소.
3. Provider adapter와 비용 측정 훅 추가.
4. Sandbox 연동(필요 시)과 에디터/Blockly 연동 작업 병행.

참고(빠른 예시)
 - HMAC 서명 예시: HMAC_SHA256(PROXY_SIGNING_KEY, `${client_id}:${timestamp}:${nonce}:${body_sha256}`)

의사결정 포인트(검토 필요)
- 토큰 발급 시 `client_secret`을 어디에 보관/검증할지(앱내 저장 대 서버사이드 인증)
- 토큰 TTL과 동시 실행량 정책(초 단위 vs 분 단위)
- 샌드박스 구현 방식(WASM 우선 vs Docker 우선)

다음 작업(제가 바로 할 수 있는 것)
1) `ai-roomchat/proxy/server.js`에 `/token` 엔드포인트와 in-memory nonce/TTL을 추가하는 PR 생성(PoC) — 바로 시작 가능
2) 간단한 E2E Jest 테스트 파일 추가 — 함께 추가

원하시면 지금 바로 (A) `/token` 구현 PR 생성 및 (B) E2E 테스트 추가를 실행하겠습니다. 어느 것을 우선할까요? (A/B/둘다)

---
끝.
# Gemini 모바일 통합 — 아키텍처 설계 및 PoC 계획

목표
- 모바일(또는 브라우저) 기반 코드 에디터에서 "Gemini CLI처럼" 프롬프트/템플릿을 작업 환경으로 다루게 하되, 서버에 과도한 부하를 주지 않고 보안(시크릿 노출, 악성 코드 실행)을 유지하는 현실적인 아키텍처와 검증 계획을 제시합니다.

요약 권장 접근
- 권장(안전·실용): 하이브리드 프록시 모델
  1) 모바일 클라이언트(에디터)는 템플릿 편집/저장/로컬 검증 기능만 수행한다.
  2) LLM 호출(실제 Gemini API 사용)은 신뢰된 '프록시/브로커' 서비스에서 수행한다. 프록시는 짧은 수명 capability token (HMAC 서명 포함)을 사용해 요청을 위임받고, 요청 유효성·속도 제한·로깅을 담당한다.
  3) 코드/템플릿의 실행(렌더링/실행)은 가능한 경우 기기 로컬에서 WASM(템플릿 변환 등)으로 수행하고, 위험하거나 리소스가 큰 작업은 관리형 샌드박스(원격)로 위임.

선택지(장단)
- 완전 온-디바이스(단독)
  - 장점: 시크릿/데이터가 클라우드에 노출되지 않음. 레이턴시 최소.
  - 단점: 모바일에서 Gemini CLI(네이티브) 구동은 현실적으로 불가능하거나 비효율적(대형 바이너리, 권한 문제). 모델 실행(LLM)은 기기에서 불가능(일반적). 유지보수/업데이트 곤란.

- 하이브리드(권장)
  - 장점: 모델 실행은 클라우드/프록시에 위임해 비용·스케일 관리, 클라이언트는 경량화. 보안: 토큰·서명·승인 흐름으로 노출 최소화.
  - 단점: 신뢰 가능한 프록시 운영 비용, 운영복잡성.

- WASM 기반 오프로드(특정 변환/검증)
  - 장점: 템플릿 렌더링·단순 변환 작업을 브라우저/모바일에서 안전하게 수행 가능. 빠르고 오프라인 친화적.
  - 단점: 모든 작업을 WASM으로 대체할 수는 없음(LLM 호출 불가).

핵심 구성요소 (권장 아키텍처)
1. 모바일 에디터(React Native / 모바일 웹)
   - 기능: 템플릿 편집, 미리보기(WASM 변환), 로컬 저장(암호화 선택), 실행 요청 생성(서명 포함)
   - 보안: 키체인/Keystore에 프로젝트별 로컬 키 보관(민감 키는 절대 저장하지 않음)

2. 브로커/프록시(서버리스 또는 관리형 서비스)
   - 역할: 인증(짧은 수명 capability token), 요청 검증(화이트리스트/쿼터), LLM 호출(공급자 API), 감사 로깅, 응답 필터링
   - 배포: 최소 2개 리전 이상으로 관리(가용성), 오토스케일
   - 보안: 서비스 계정 키는 GitHub `production` Environment에 보관. 프록시는 HMAC 서명(요청 바디 + nonce)으로 클라이언트 요청 검증

3. 샌드박스/실행 환경(원격)
   - 위험한 코드(템플릿에서 실행되는 스크립트 등)는 원격 샌드박스에서 실행(가상화: gVisor/Firecracker 또는 k8s with seccomp)
   - 샌드박스는 네트워크/FS/시간/메모리 제한, 결과 흡수(escape 방지)

4. 감사/모니터링
   - 모든 요청은 audit log로 수집(프록시에서 중앙 저장: Supabase/Elasticsearch 등)
   - 중요 이벤트(체크섬 불일치, sandbox crash, 토큰 오남용)는 알람으로 전파

인증/권한 모델(간단)
- 클라이언트 → 프록시: 클라이언트는 사용자 인증(예: OAuth session)을 사용해 로그인 후, 프록시에서 발급한 짧은 capability token을 사용
- 토큰은 요청에 포함된 HMAC 서명을 요구 — 서버는 서버-사이드 시크릿으로 서명을 검증
- 프록시는 요청 빈도·크기/사용자 권한을 검사해 오남용 방지

위협 모델(간단)
- 시크릿 유출: 모든 장기 시크릿은 서버 환경에 보관(예: GitHub Environment, KMS). 클라이언트에는 토큰만 발급.
- 악성 템플릿: 템플릿 검증(WASM 실행으로 정적 체크), 실행은 샌드박스에서만 실행
- 프록시 악용: 요청당 쿼터, IP/계정 차단, 비정상 활동은 알람

PoC 단계(우선순위)
1) 설계문서 (현재 작업) — 이 문서: 요건, 보안, 배포 옵션, 비용 추정, acceptance criteria (오늘 추가됨)
2) 프록시 샘플 (serverless)
   - 간단한 signed proxy: `/v1/gemini` 엔드포인트, HMAC 인증, request -> provider API -> response 반환. 로깅 포함
3) 에디터 최소 프로토타입 (웹/모바일 웹)
   - Monaco 편집기 + 'Run via Proxy' 버튼, locally store template, sign request and call proxy
4) WASM mini-PoC
   - 템플릿 렌더링을 WASM으로 구현(브라우저에서 안전하게 실행 가능)
5) 샌드박스 PoC
   - 위험한 실행은 Docker-limited 또는 Firecracker/gVisor 환경에서 실행

Acceptance criteria
- 클라이언트에서 템플릿을 편집해 프록시로 서명된 요청을 보내면, 프록시가 Gemini(또는 mock) 호출을 수행하고 결과를 반환한다.
- 모든 호출은 로깅되고, 토큰/서명 검증 실패 시 요청이 거부되어야 한다.
- 템플릿에 포함된 '스크립트' 또는 위험 동작은 원격 샌드박스에서만 실행되어야 한다.

타임라인(대략)
- 설계 문서: 1–2일 (오늘 시작, 문서화)  ← 지금 단계
- 프록시 PoC: 2–3일 (프록시 + mock provider) — 이후 검증
- 에디터 프로토타입: 3–5일 (기본 UI + Run 통합)
- 샌드박스 통합: 4–7일(인프라와 보안 설정, 테스트)

다음 직접 작업(제가 바로 할 것)
1. 이 문서 보강: 시나리오별 sequence diagram 및 요청/응답 예시 추가 (오늘) ✅
2. 프록시 PoC 코드 스켈레톤 추가(간단한 Node server) — PoC 브랜치에 푸시 예정

질문(빠르게 알려주시면 반영)
- Gemini 호출을 실제 Gemini API로 바로 연결할까요, 아니면 처음에는 mock provider로 시작할까요? (권장: mock → 실제로 전환)
