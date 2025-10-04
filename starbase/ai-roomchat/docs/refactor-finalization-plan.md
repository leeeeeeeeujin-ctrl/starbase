# 리팩토링 및 구현 마무리 청사진

## 1. 전체 구현 점검
- [ ] 주요 페이지(예: 로그인, 채팅방 리스트, 채팅룸, 프로필 등) 기능 흐름 검토
- [ ] 서비스 레이어(`services/`) API 호출 동작 및 에러 핸들링 확인
- [ ] 상태 관리 및 데이터 fetch 로직(`modules/`, `hooks/`) 간 중복/누락 확인
- [ ] 접근성(A11y) 기본 점검: 대체 텍스트, 키보드 네비게이션, 명도 대비
- [ ] 다국어/로케일 고려 사항이 있는지 여부 파악 및 TODO 남기기

## 2. 환경 변수 및 로컬 세팅 정리
1. **Supabase 관련**
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 최신값 확인 및 `.env.local.example` 업데이트
   - `SUPABASE_SERVICE_ROLE`이 필요한 서버사이드 모듈(`lib/`, `pages/api/`) 위치 재확인
   - 로컬 개발 시 SQL seed 스크립트(`supabase_chat.sql`, `supabase_social.sql`) 적용 절차 문서화
2. **Auth/Providers**
   - OAuth 공급자 사용 시 필요한 client id/secret 항목 정리 및 예시값 주석
   - 개발/운영 분리 전략: `.env.development.local`, `.env.production` 템플릿 준비 여부 확인
3. **기타**
   - `NEXT_PUBLIC_SOCKET_URL` 혹은 WebSocket 사용 시 필요한 포트 확인
   - Vercel 배포 시 필요한 환경 변수 대조표 작성

## 3. 리팩토링 후보 리스트업
- **컴포넌트 구조**
  - `components/` 내 중복 UI 패턴(`Button`, `Input`, `Avatar`) 통합 여부 검토
  - `pages/`에서 직접 상태 관리하는 로직을 `hooks/` 혹은 `modules/`로 이동 가능한지 확인
- **상태/스토어**
  - Zustand/Recoil 등 사용 시 store 분리 기준 점검, 공통 selector 메모이제이션 검토
  - `modules/chat` 등에서 실시간 업데이트 로직의 cleanup 및 unsubscribe 여부 체크
- **유틸/서비스**
  - `utils/` 폴더 내 날짜/문자열 포맷 함수 중복 여부 확인
  - API 응답 타입 정의(`lib/types.ts` 등) 통합 및 `zod`/`io-ts` 검증 도입 고려

## 4. 테스트 및 품질 보증
- [ ] 주요 유닛 테스트(`__tests__/`, `tests/`) 통과 확인 및 커버리지 리뷰
- [ ] Playwright/E2E 시나리오에서 채팅 흐름(로그인→대화→로그아웃) 검증
- [ ] Lint/Format 스크립트(`npm run lint`, `npm run format:check`) 실행 및 CI 파이프라인 반영 여부 확인
- [ ] `pre-commit` 훅 설정 필요 시 `husky`/`lint-staged` 도입 검토

## 5. 일정/체크리스트 초안
| 단계 | 작업 | 담당 | 예상 기간 |
| --- | --- | --- | --- |
| 1 | 기능 흐름 QA 및 버그 리스트업 | FE/QA | 1일 |
| 2 | 환경 변수 문서화 및 템플릿 업데이트 | FE | 0.5일 |
| 3 | 우선순위 높은 리팩토링(컴포넌트/서비스) | FE | 1~1.5일 |
| 4 | 테스트 보강 및 CI 점검 | FE/QA | 0.5일 |
| 5 | 릴리즈 체크리스트 최종 검토 | FE/PM | 0.5일 |

## 6. 후속 TODO 템플릿
- [ ] 버그/개선 사항 이슈 트래킹(예: Linear, Jira)에 등록
- [ ] 문서 업데이트(README, `/docs`) 및 공유
- [ ] 운영 환경 모니터링/알림 세팅 점검

---
**Note:** 메인 게임 플레이 로직은 별도 이슈로 분리하고, 상기 리스트 완료 후 집중 구현을 진행한다.
