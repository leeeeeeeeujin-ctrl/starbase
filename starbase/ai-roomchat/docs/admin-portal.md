# Rank Game Admin Portal

이 페이지는 모드 태깅 백필과 슬롯 운영을 지원하는 전용 관리자 창구입니다. `/admin/portal` 경로에서 접근할 수 있으며, 다음과 같은 보안 및 운영 원칙을 따릅니다.

## 인증

- 접속 시 관리자 비밀번호 입력 폼이 표시됩니다. 비밀번호는 서버 사이드에서만 비교하며 기본값을 제공하지 않습니다.
- 반드시 환경 변수 `ADMIN_PORTAL_PASSWORD`를 설정해야 하며, 미설정 시 로그인 폼 대신 환경 구성 안내가 노출됩니다.
- 올바른 비밀번호 입력 시 12시간 동안 유지되는 HttpOnly 세션 쿠키가 발급됩니다.

## 노출 정보

인증 이후에는 백필 운영에 필요한 핵심 체크리스트와 링크를 한눈에 확인할 수 있습니다.

- **서비스 롤 키** – 스테이징/프로덕션 Supabase 서비스 롤 키를 비밀 금고에 저장하고, 워커/크론 환경 변수로 배포해야 합니다.
- **스크립트 실행 환경** – 백필 및 데이터 감사 스크립트가 실행될 런타임(예: Vercel 크론, 서버리스 워커, 전용 CLI)을 확보합니다.
- **역사 데이터 덤프** – `rank_battle_logs`, `rank_sessions`, `rank_turns` 스냅샷을 정기적으로 백업합니다.
- **QA 확인 창구** – 전용 QA 채널과 배포 전후 체크리스트를 준비합니다.

추후 런북·스프레드시트 링크를 연결할 수 있도록 자리표시자가 준비돼 있습니다.

## 연동 API

- `POST /api/admin/login` – 비밀번호를 검증하고 세션 쿠키를 발급합니다. 본문은 `{ password: string }` 형태입니다.
- API 응답이 `200`일 경우 브라우저는 자동으로 새로고침해 인증 상태로 전환됩니다.

## 환경 변수 관리

- 저장소에는 암호화된 `.env.vault`만 커밋하고, 평문 `.env`는 항상 `.gitignore`에 유지합니다.
- 처음 설정할 때는 `npm install -D dotenv dotenv-vault` 이후 `npx dotenv-vault login`, `npx dotenv-vault push`, `npx dotenv-vault build` 순으로 vault를 생성합니다.
- 로컬에서 `ADMIN_PORTAL_PASSWORD` 등 비밀 값을 `.env`에 입력한 뒤 `npx dotenv-vault build`를 실행하면 `.env.vault`가 갱신됩니다.
- 배포 환경(Vercel 등)에는 `DOTENV_KEY`를 추가하면 런타임에서 `.env.vault`가 자동 복호화되어 `process.env`에 값이 주입됩니다.
- `ADMIN_PORTAL_PASSWORD` 외에도 Supabase 키(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`)와 슬롯 스위퍼 비밀(`RANK_SLOT_SWEEPER_SECRET`)을 함께 관리하세요.

## 운영 팁

- 배포 파이프라인에서 `ADMIN_PORTAL_PASSWORD`를 환경 변수로 지정하면 F12 등을 통한 소스 확인으로도 비밀번호가 노출되지 않습니다.
- 쿠키 유지 시간이 만료된 경우 다시 비밀번호를 입력해야 하며, 브라우저 캐시에 의존하지 않습니다.
- 문제가 발생하면 문서에 명시된 연락 창구(`rank-admin@starbase.dev`, `#rank-admin-ops`)로 즉시 보고합니다.
