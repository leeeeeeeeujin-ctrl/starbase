```markdown
# AI-Roomchat Docs Index

이 폴더는 AI 룸챗/플랫폼 관련 문서를 모아놓은 곳입니다. 아래 섹션은 문서의 논리적 그룹이며, 각 항목은 해당 문서로의 상대 경로 링크입니다.

## 00 - Quick index (빠른 시작)
- 프로젝트 개요: `project-overview.md`
- 플랫폼 로드맵: `platform-roadmap.md`
- 아키텍처 개요: `hybrid-architecture.md`, `ARCHITECTURE_DIAGRAM.md`

## 01 - Architecture & Workload
- 하이브리드 아키텍처: `hybrid-architecture.md`
- 아키텍처 다이어그램(루트): `../ARCHITECTURE_DIAGRAM.md`
- 런로드 분담(클라이언트/에지/서버): `ARCHITECTURE_RUNLOAD.md`

## 02 - Security & Sandbox
- 디바이스 등록: `DEVICE_REGISTRATION.md`
- 환경 변수 가이드: `environment-variables.md`
- 샌드박스 & 안전 실행 가이드: `SANDBOX_ARCHITECTURE.md`
- 로컬 자격/키: `LOCAL_CREDENTIALS.md`

## 03 - Runners, CLI & Mobile
- Gemini/CLI 통합: `gemini-cli-integration.md`
- 모바일 러너 설치: `MOBILE_RUNNER_INSTALL.md`
- AI 워커 빠른 시작: `ai-worker-quickstart.md`

## 04 - Prompt Editor / Maker
- 메이커 및 JSON 스키마: `maker-json-schema.md`
- 프롬프트 세트 버전 가이드: `rank-prompt-set-versioning-guide.md`

## 05 - Execution / Scoring / Game Integration
- 게임 실행 로직 및 설계: `rank-game-logic-plan.md`, `main-game-structure.md`
- 세션/배틀 로그: `rank-session-battle-log-spec.md`

## 06 - DB, Migrations, CI & Ops
- Supabase 관련: `supabase-ai-dev-schema.md`, `supabase-rank-schema.sql`
- SQL 폴더: `sql/`
- 워크플로우 관련: `.github/workflows/` (레포 루트)

## 07 - Tests, QA, Troubleshooting
- 문제 해결 폴더: `troubleshooting/`
- 리얼타임 문제: `realtime-troubleshooting-2025-11-08.md`

## 08 - How-tos / Playbooks
- 플랫폼 실행/배포 가이드: `ai-worker-extension-2day-plan.md`, `ai-worker-extension-spec.md`

---
사용자/개발자 참고: 문서를 수정하거나 새 문서를 추가할 때는 이 인덱스에 적절한 링크를 추가해 주세요. 필요하면 섹션을 더 세분화하고 자동화 스크립트로 인덱스를 생성할 수 있습니다.
```
