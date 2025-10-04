# Environment Variables

이 프로젝트는 주요 운영 기능을 보호하기 위해 몇 가지 서버 환경 변수를 요구합니다. 아래 표를 참고해 배포 환경과 로컬 시크릿 매니저에 값을 등록하세요.

| 변수 | 설명 | 사용 위치 | 비고 |
| --- | --- | --- | --- |
| `ADMIN_PORTAL_PASSWORD` | 관리자 포털(`/admin/portal`) 접근 시 인증에 사용하는 비밀번호입니다. | `pages/admin/portal.js`, `pages/api/admin/login.js` | **서버 전용** 변수입니다. 브라우저에 노출되지 않도록 서버 환경에만 설정하세요. |
| `SUPABASE_URL` *(Edge Functions)* | Supabase 프로젝트 URL. Edge Function 런타임이 직접 REST/Realtime 호출을 수행할 때 사용합니다. | `supabase/functions/_shared/supabaseClient.ts` | `NEXT_PUBLIC_SUPABASE_URL`과 동일한 값을 설정하세요. |
| `SUPABASE_SERVICE_ROLE` | Supabase 서비스 롤 키로, 랭크 게임 관련 서버 API가 보호 테이블에 쓰기 작업을 수행할 때 사용합니다. | `lib/rank/db.js`, `pages/api/rank/*.js`, `supabase/functions/_shared/supabaseClient.ts` | Supabase 프로젝트 설정의 `service_role` 키 값을 그대로 사용합니다. 절대 클라이언트에 노출하지 마세요. Edge Function 환경에서는 `SUPABASE_SERVICE_ROLE_KEY` 변수명도 허용됩니다. |
| `RANK_SLOT_SWEEPER_SECRET` | 슬롯 정리 작업(`/api/rank/slot-sweeper`)을 트리거할 때 사용하는 공유 비밀입니다. | `pages/api/rank/slot-sweeper.js`, `docs/slot-sweeper-schedule.md` | 크론 잡이나 백오피스에서 호출 시 쿼리 파라미터 `secret` 값으로 전달합니다. 현재 기본값은 `171819`입니다. |
| `RANK_COOLDOWN_ALERT_WEBHOOK_URL` | API 키 쿨다운 발생 시 Slack/Webhook 알림을 보낼 엔드포인트 URL입니다. | `lib/rank/cooldownAutomation.js`, `pages/api/rank/cooldown-report.js`, `pages/api/rank/cooldown-digest.js` | 미설정 시 경보는 건너뜁니다. |
| `RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION` *(선택)* | Webhook 호출에 사용할 `Authorization` 헤더 값입니다. | `lib/rank/cooldownAutomation.js` | 필요하지 않다면 비워 두세요. |
| `RANK_COOLDOWN_ALERT_DOC_URL` *(선택)* | Slack/Webhook 알림 본문에 자동으로 첨부할 운영 가이드 문서 URL입니다. | `lib/rank/cooldownAutomation.js`, `pages/api/rank/cooldown-report.js`, `pages/api/rank/cooldown-digest.js` | 미설정 시 저장소 기본 문서 링크가 사용됩니다. |
| `RANK_COOLDOWN_ALERT_THRESHOLDS` *(선택)* | 쿨다운 경보 지표 임계값을 JSON으로 오버라이드할 때 사용합니다. `{ "failureRate": { "warning": 0.3 } }` 형태로 작성하면 해당 항목만 교체되고 나머지는 기본값이 유지됩니다. | `pages/api/rank/cooldown-telemetry.js`, `lib/rank/cooldownAlertThresholds.js` | 파싱에 실패하면 기본값이 적용되며, `null`을 지정하면 해당 임계값 비교가 비활성화됩니다. |
| `RANK_COOLDOWN_ALERT_AUDIT_WEBHOOK_URL` *(선택)* | 경보 임계값(`RANK_COOLDOWN_ALERT_THRESHOLDS`)이 변경될 때 감사 알림을 전송할 Slack/Webhook URL입니다. | `lib/rank/cooldownAlertThresholdAuditTrail.js` | 미설정 시 일반 경보용 Webhook(`RANK_COOLDOWN_ALERT_WEBHOOK_URL`)이 재사용됩니다. |
| `RANK_COOLDOWN_ALERT_AUDIT_WEBHOOK_AUTHORIZATION` *(선택)* | 감사 알림 Webhook 호출 시 사용할 `Authorization` 헤더 값입니다. | `lib/rank/cooldownAlertThresholdAuditTrail.js` | 설정하지 않으면 일반 경보 토큰(`RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION`) 또는 `RANK_COOLDOWN_ALERT_WEBHOOK_TOKEN`이 순차적으로 재사용됩니다. |
| `RANK_REALTIME_EVENT_WEBHOOK_URL` *(선택)* | 실시간 경고/대역 이벤트를 Slack/Webhook으로 전파할 엔드포인트 URL입니다. | `pages/api/rank/log-turn.js`, `lib/rank/realtimeEventNotifications.js`, `supabase/functions/rank-match-timeline`, `supabase/functions/rank-api-key-rotation` | 설정 시 경고·대역 이벤트가 즉시 알림으로 전달됩니다. |
| `RANK_REALTIME_EVENT_WEBHOOK_AUTHORIZATION` *(선택)* | 실시간 이벤트 Webhook 호출 시 사용할 `Authorization` 헤더 값입니다. | `lib/rank/realtimeEventNotifications.js`, `supabase/functions/rank-match-timeline`, `supabase/functions/rank-api-key-rotation` | 필요한 경우 `RANK_REALTIME_EVENT_WEBHOOK_TOKEN` 또는 동일 용도의 토큰을 대신 사용할 수 있습니다. |
| `RANK_REALTIME_EVENT_CHANNEL_PREFIX` *(선택)* | Supabase Realtime 채널 이름의 접두사를 커스터마이즈합니다. | `lib/rank/realtimeEventNotifications.js`, `components/rank/StartClient/useStartClientEngine.js`, `supabase/functions/rank-match-timeline`, `supabase/functions/rank-api-key-rotation` | 기본값은 `rank-session`이며, 다중 환경에서 채널 이름이 충돌할 때만 조정하세요. |
| `AUDIO_EVENT_SLACK_WEBHOOK_URL` *(선택)* | 오디오 이벤트 주간 추이를 Slack/Webhook으로 전송할 엔드포인트 URL입니다. | `scripts/notify-audio-event-trends.js`, `/.github/workflows/*.yml` | 미설정 시 주간 알림 단계가 자동으로 건너뜁니다. |
| `AUDIO_EVENT_SLACK_AUTH_HEADER` *(선택)* | 오디오 이벤트 알림 호출 시 사용할 `Authorization` 헤더 값입니다. | `scripts/notify-audio-event-trends.js` | 웹훅이 인증을 요구할 때만 설정하세요. |
| `AUDIO_EVENT_TREND_LOOKBACK_WEEKS` *(선택)* | Slack 요약에 포함할 주간 누적 범위를 지정합니다. | `scripts/notify-audio-event-trends.js` | 1~52 사이 정수를 권장하며, 기본값은 12주입니다. |
| `RANK_COOLDOWN_ROTATION_URL` | 고갈된 키를 교체하거나 비활성화하는 자동화 스크립트 엔드포인트 URL입니다. | `lib/rank/cooldownAutomation.js`, `pages/api/rank/cooldown-report.js`, `pages/api/rank/cooldown-digest.js` | 설정 시 경보 직후 자동화 요청이 발송됩니다. |
| `RANK_COOLDOWN_ROTATION_SECRET` *(선택)* | 자동화 엔드포인트 호출 시 사용할 토큰으로 `Authorization` 헤더에 주입됩니다. | `lib/rank/cooldownAutomation.js` | 엔드포인트에서 인증이 필요할 때만 설정하세요. |
| `RANK_COOLDOWN_ROTATION_PROVIDER_FILTER` *(선택)* | 특정 제공자에 대해서만 자동 교체를 실행하고 싶을 때 소문자 제공자 명칭을 지정합니다. | `lib/rank/cooldownAutomation.js` | 미설정 시 모든 제공자에 대해 자동 교체가 시도됩니다. |
| `TEAM_DRIVE_SERVICE_ACCOUNT_EMAIL` *(선택)* | 팀 드라이브 업로드에 사용할 Google 서비스 계정 이메일입니다. | `lib/rank/teamDriveUploader.js`, `pages/api/rank/upload-cooldown-timeline.js` | `TEAM_DRIVE_PRIVATE_KEY`, `TEAM_DRIVE_FOLDER_ID`와 함께 설정하면 Google Drive에 직접 업로드합니다. |
| `TEAM_DRIVE_PRIVATE_KEY` *(선택)* | 서비스 계정의 비공개 키 문자열입니다. 줄바꿈은 `\n`으로 이스케이프해 입력하세요. | `lib/rank/teamDriveUploader.js`, `pages/api/rank/upload-cooldown-timeline.js` | 보안상 서버 환경 변수에만 저장하세요. |
| `TEAM_DRIVE_FOLDER_ID` *(선택)* | 내보낸 파일을 저장할 팀 드라이브 폴더 ID입니다. | `lib/rank/teamDriveUploader.js`, `pages/api/rank/upload-cooldown-timeline.js` | 미설정 시 루트에 업로드되며, `TEAM_DRIVE_EXPORT_DIR`이 지정되면 파일 시스템 경로가 우선합니다. |
| `TEAM_DRIVE_EXPORT_DIR` *(선택)* | Google Drive 대신 로컬/마운트된 경로에 파일을 저장하고 싶을 때 지정하는 절대/상대 경로입니다. | `lib/rank/teamDriveUploader.js`, `pages/api/rank/upload-cooldown-timeline.js` | 서비스 계정 설정이 없어도 경로만 지정하면 파일 복사가 수행됩니다. |

## 설정 가이드
1. **배포 환경** (예: Vercel): 프로젝트 설정 → Environment Variables에 위 변수와 값을 추가합니다.
2. **로컬 개발**: `.env.local` 파일을 사용하거나 개인 시크릿 매니저를 통해 런타임에 주입하세요. `.env.local`은 `.gitignore`로 보호되어야 합니다.
3. **보안 유의사항**:
   - 세 변수 모두 절대 버전 관리 저장소나 클라이언트 코드에 기록하지 마세요.
   - 값 변경 시 관련 서버리스 함수(예: 관리자 포털, 랭크 API)를 재배포해야 합니다.

필요한 값은 운영 담당자로부터 전달받거나 Supabase/Vercel 대시보드에서 확인한 뒤 즉시 등록해 주세요.
