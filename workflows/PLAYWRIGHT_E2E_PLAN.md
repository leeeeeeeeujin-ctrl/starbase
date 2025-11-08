# Playwright / E2E Test Plan

목표: 핵심 사용자 플로우(end-to-end)를 자동화하고 PR에서 회귀를 탐지합니다.

핵심 시나리오(우선순위)
1. 템플릿 편집 → 저장 → 실행 → 결과 확인
2. 디바이스 등록 → 시그니처 검증 → 실행
3. 감사 로그가 정상 기록되는지 확인

테스트 구성
- Playwright 사용, `ai-roomchat/playwright.config.ts`가 이미 있으므로 테스트 폴더는 `ai-roomchat/tests/e2e`로.
- 간단한 환경: 테스트용 DB(테이블 초기화 스크립트), 모의 Supabase(또는 실제 dev Supabase with test bucket)

CI 정책
- PR에서 빠른 smoke 테스트(브라우저 없는 mode)를 실행
- 스케줄 워크플로(야간)에 전체 브라우저 테스트 실행

실행 예
```powershell
cd ai-roomchat
npx playwright test tests/e2e --project=chromium
```
