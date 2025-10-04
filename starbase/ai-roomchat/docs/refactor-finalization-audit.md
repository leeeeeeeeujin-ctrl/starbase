# 리팩토링/구현 마무리 점검 로그

> 기반 문서: [`refactor-finalization-plan.md`](./refactor-finalization-plan.md)

## 1. 환경 변수 및 로컬 세팅
- [x] `.env.local.example` 추가 및 현재 레포에 사용 중인 환경 변수 맵 정리 (Supabase/랭크 자동화/Edge 배포 포함)
- [x] `SUPABASE_SERVICE_ROLE`이 필요한 서버 모듈(`lib/supabaseAdmin.js`, `pages/api/rank/*`) 목록 확인
- [ ] SQL seed 스크립트 실행 절차 정리 (`supabase_chat.sql`, `supabase_social.sql`) – TODO: 샘플 명령어/Prerequisite 작성 필요

### 참고 메모
- 테스트 러너(`jest.setup.js`)도 Supabase URL/Service Role을 요구하므로 CI 환경 변수 세트에 포함되어야 함.
- `.env.local.example`은 실 서비스용 시크릿을 배제하고, Slack/PagerDuty/Webhook 계열 변수는 기본 placeholder로 제공.

## 2. 전체 구현 점검(진행 예정)
- [ ] 주요 화면 UX 플로우 스모크 테스트 (로그인 → 채팅 → 로그아웃)
- [ ] 서비스/훅 레이어 중복 여부 파악 – TODO: `modules/` vs `hooks/` 의존성 다이어그램 작성 예정
- [ ] 접근성 기본 점검 – TODO: `pages/` 수준에서 Lighthouse/Axe 체크리스트 작성

## 3. 리팩토링 후보(초안)
- [ ] `components/` 공통 UI 아톰 통합 범위 확정 – TODO: Button/Input/Avatar 실사용처 리스팅
- [ ] Zustand/Recoil 사용처 유무 조사 – TODO: 상태 관리 패턴 문서화 후 필요시 store 분리안 제안
- [ ] `utils/` 포맷터 중복 수집 – TODO: 날짜/문자열 함수 사용처 rg 스캔

## 4. 테스트 및 품질 보증
- [ ] `npm run lint` & `npm run test` 기본 파이프라인 실행 – TODO: GitHub Actions 설정 확인
- [ ] Playwright E2E 주요 시나리오 정의 – TODO: `playwright.config.ts` 기반 URL/계정 준비
- [ ] Husky/Lint-staged 도입 여부 결정 – TODO: 커밋 훅 필요성 평가

## 5. 일정/다음 스텝
- [ ] QA & 버그 리스트업 Kick-off – 담당자 어사인 필요
- [ ] 환경 변수 템플릿 공유 및 Onboarding 가이드 작성
- [ ] 리팩토링 범위 확정 후 일정 리베이스

---
- 진행 로그는 각 체크 완료 시 갱신하며, 관련 커밋/PR 링크를 함께 추가 예정.
