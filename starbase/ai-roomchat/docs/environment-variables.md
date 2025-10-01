# Environment Variables

이 프로젝트는 주요 운영 기능을 보호하기 위해 몇 가지 서버 환경 변수를 요구합니다. 아래 표를 참고해 배포 환경과 로컬 시크릿 매니저에 값을 등록하세요.

| 변수 | 설명 | 사용 위치 | 비고 |
| --- | --- | --- | --- |
| `ADMIN_PORTAL_PASSWORD` | 관리자 포털(`/admin/portal`) 접근 시 인증에 사용하는 비밀번호입니다. | `pages/admin/portal.js`, `pages/api/admin/login.js` | **서버 전용** 변수입니다. 브라우저에 노출되지 않도록 서버 환경에만 설정하세요. |
| `SUPABASE_SERVICE_ROLE` | Supabase 서비스 롤 키로, 랭크 게임 관련 서버 API가 보호 테이블에 쓰기 작업을 수행할 때 사용합니다. | `lib/rank/db.js`, `pages/api/rank/*.js` | Supabase 프로젝트 설정의 `service_role` 키 값을 그대로 사용합니다. 절대 클라이언트에 노출하지 마세요. |
| `RANK_SLOT_SWEEPER_SECRET` | 슬롯 정리 작업(`/api/rank/slot-sweeper`)을 트리거할 때 사용하는 공유 비밀입니다. | `pages/api/rank/slot-sweeper.js`, `docs/slot-sweeper-schedule.md` | 크론 잡이나 백오피스에서 호출 시 쿼리 파라미터 `secret` 값으로 전달합니다. 현재 기본값은 `171819`입니다. |
| `RANK_COOLDOWN_ALERT_WEBHOOK_URL` | API 키 쿨다운 발생 시 Slack/Webhook 알림을 보낼 엔드포인트 URL입니다. | `lib/rank/cooldownAutomation.js`, `pages/api/rank/cooldown-report.js`, `pages/api/rank/cooldown-digest.js` | 미설정 시 경보는 건너뜁니다. |
| `RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION` *(선택)* | Webhook 호출에 사용할 `Authorization` 헤더 값입니다. | `lib/rank/cooldownAutomation.js` | 필요하지 않다면 비워 두세요. |
| `RANK_COOLDOWN_ROTATION_URL` | 고갈된 키를 교체하거나 비활성화하는 자동화 스크립트 엔드포인트 URL입니다. | `lib/rank/cooldownAutomation.js`, `pages/api/rank/cooldown-report.js`, `pages/api/rank/cooldown-digest.js` | 설정 시 경보 직후 자동화 요청이 발송됩니다. |
| `RANK_COOLDOWN_ROTATION_SECRET` *(선택)* | 자동화 엔드포인트 호출 시 사용할 토큰으로 `Authorization` 헤더에 주입됩니다. | `lib/rank/cooldownAutomation.js` | 엔드포인트에서 인증이 필요할 때만 설정하세요. |
| `RANK_COOLDOWN_ROTATION_PROVIDER_FILTER` *(선택)* | 특정 제공자에 대해서만 자동 교체를 실행하고 싶을 때 소문자 제공자 명칭을 지정합니다. | `lib/rank/cooldownAutomation.js` | 미설정 시 모든 제공자에 대해 자동 교체가 시도됩니다. |

## 설정 가이드
1. **배포 환경** (예: Vercel): 프로젝트 설정 → Environment Variables에 위 변수와 값을 추가합니다.
2. **로컬 개발**: `.env.local` 파일을 사용하거나 개인 시크릿 매니저를 통해 런타임에 주입하세요. `.env.local`은 `.gitignore`로 보호되어야 합니다.
3. **보안 유의사항**:
   - 세 변수 모두 절대 버전 관리 저장소나 클라이언트 코드에 기록하지 마세요.
   - 값 변경 시 관련 서버리스 함수(예: 관리자 포털, 랭크 API)를 재배포해야 합니다.

필요한 값은 운영 담당자로부터 전달받거나 Supabase/Vercel 대시보드에서 확인한 뒤 즉시 등록해 주세요.
