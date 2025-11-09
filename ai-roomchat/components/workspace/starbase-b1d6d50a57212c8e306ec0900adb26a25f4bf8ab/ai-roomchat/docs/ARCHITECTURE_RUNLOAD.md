```markdown
# Architecture: 3-tier Workload Partitioning (Client / Edge / Server)

이 문서는 프롬프트-노드 시스템(편집기/런너/검증/점수계산)이 어디에서 실행되어야 하는지에 대한 실용적 가이드입니다. 각 작업을 어떤 레이어에서 처리할지, 보안·성능·비용 관점에서의 트레이드오프와 API 계약 예시를 제시합니다.

## 요약
- Client(앱/브라우저): 편집 UX, 블록-에디터, 로컬 미리보기 및 로컬 실행(사용자 책임), 정적 검사
- Edge(Edge Workers): 초저지연 미리보기, 경량 시뮬레이션, 정책/검증 캐시
- Server(신뢰 도메인): 민감 작업(비밀 사용), 영속화, 심층 검증, 점수산정, 감사 로그

## 레이어별 책임과 예시

1) Client (앱 / 브라우저 / 데스크탑)
  - 책임
    - UI/블록 에디터, 템플릿 편집/검증(정적 규칙), 로컬 저장/버전
    - 고급 사용자의 로컬 CLI 실행 옵션(사용자 책임, 문서화 필요)
    - Wasm 기반의 안전한 텍스트 변환/후처리(가능하면)
  - 금기
    - 서버 시크릿 저장/전달
    - 신뢰할 수 없는 대형 모델 호출(서비스 키 필요시)

2) Edge (Vercel Edge, Cloudflare Workers, CDN workers)
  - 책임
    - 빠른 미리보기/요약(토큰 소모 적게), 입력형식 검증, 미리보기용 경량 실행
    - 정책/정적 검사 캐싱(서버 판정 전의 1차 방어)
    - short-lived tokens 발급(권한 위임, 짧은 TTL)
  - 제약
    - 실행 시간이 제한됨(초 단위), 로컬 파일/네트워크 접근 제한이 큼

3) Server (Next.js API / 백엔드)
  - 책임
    - 최종 모델 실행(서비스 키 필요시), 점수 계산, DB 영속화, 감사로그 저장
    - 격리 실행(에페메랄 컨테이너 / microVM) — untrusted job 처리
    - 정책 시행(매니페스트 검증), 시크릿 키 관리, 감사/모니터링
  - 비고
    - 서버는 job manifest(allowed_flags, max_tokens, allow_network 등)를 검증하고 러너가 이를 강제해야 함

## 어떤 작업을 어느 레이어에서 처리할지(매핑 표)

예시 작업 → 우선 레이어
- 편집(블록/코드) 저장/버전: Client + Server(영속화)
- 빠른 미리보기(요약/샘플 응답): Edge
- 전체 모델 실행(대형 토큰·비용 소모): Server (또는 사용자가 로컬에 설치한 CLI)
- 점수 계산 / 게임 상태 업데이트: Server
- 감사로그 저장 / 쿼리: Server
- 정적 악성패턴 차단: Client + Edge (빠른 필터), Server (강제)

## API 계약 예시 (간단)

1) Client → Server: run request (client-executed provider_response 제출)

POST /api/prompts/:id/run
Content-Type: application/json

{
  "provider": "client", // or server-side provider id
  "provider_response": { "text":"...", "rendered_prompt":"..." },
  "meta": { "device_id":"...", "template_sha256":"..." }
}

서버는 `rendered_prompt`를 서버에서 렌더링하여 일치 여부를 검사하고(verification), 불일치 시 `unverified`로 표시 후 감사 대상으로 저장.

2) Server-side job manifest (서버 내부, job 생성 시 포함)

{
  "allowed_flags": ["--format=json"],
  "max_tokens": 2000,
  "max_runtime_seconds": 60,
  "allow_network": false
}

러너는 manifest를 읽어 네트워크, 리소스, 허용 플래그를 강제합니다.

## 보안 권장 사항(요약)
- 시크릿은 서버에만 보관. 클라이언트로 전송 금지.
- 실행은 `default deny` 원칙으로 — 명시 허용된 플래그/도메인만 허용.
- 모든 실행 로그는 요약(마스킹) 형태로 저장하고 원본 민감 데이터는 별도 보호.
- 클라이언트에서 실행할 경우 사용자에게 책임 고지와 로컬 보안 지침을 제공.

## 운영/모니터링
- 수집 지표: 실행 수, 실패율, 평균 토큰 사용량, 장시간 실행 비율, 보안 위반 경보 수
- 알림: 이상 징후(연속 실패, 대량 실행, 감지된 유출 패턴) 발생 시 자동 차단 및 알림

## 권장 단계(실행 플랜)
1. Client 정적 검사 도입(정규식/AST 기반) — 빠른 효과
2. Edge로 미리보기 이전(토큰 소모 최적화) — UX 개선
3. Server ephemeral-run 파이프라인 구축(컨테이너+seccomp) — 핵심 보안
4. 필요시 microVM 전환(멀티테넌시가 중요할 때)

---
이 문서는 `hybrid-architecture.md`와 `SANDBOX_ARCHITECTURE.md`의 요지와 운영 권장사항을 하나의 실용 가이드로 모아 재구성한 것입니다. 실제 운영 전 정책(허용 플래그 목록, 리소스 한계)은 팀별로 조정하세요.
```
