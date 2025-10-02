# API Key Cooldown Monitoring Playbook

이 문서는 로컬에서 감지한 API 키 고갈 정보를 서버 로그·알림 파이프라인으로 전달하는 흐름을 설명합니다.

## 구성 요소

1. **클라이언트 보고**
   - `lib/rank/apiKeyCooldown.js`의 `markApiKeyCooldown`이 쿨다운이 기록되면 `/api/rank/cooldown-report`로 해시된 키, 사유, 만료 예정 시각을 전송합니다.
   - 전송은 `navigator.sendBeacon`을 우선 사용하며, 실패 시 `fetch`로 재시도합니다. 전송 실패는 콘솔 경고로만 남기며 로컬 스토어에는 기존과 동일하게 보관됩니다.

2. **서버 수집 및 실시간 알림**
   - `/api/rank/cooldown-report`는 요청 본문을 정규화해 Supabase `rank_api_key_cooldowns` 테이블에 삽입합니다.
   - 기록 컬럼: `key_hash`, `key_sample`, `reason`, `provider`, `viewer_id`, `game_id`, `session_id`, `recorded_at`, `expires_at`, `reported_at`, `note`.
   - 서버 오류가 발생하면 500을 반환하며 콘솔 로그로 세부 정보를 남깁니다.
   - 삽입 이후 `lib/rank/cooldownAutomation.js`를 호출해 Slack/Webhook 경보와 키 교체 자동화 엔드포인트를 순차적으로 실행합니다.
   - 경보 또는 자동화가 한 번이라도 성공하면 `notified_at`을 현재 시각으로 갱신하고, 결과는 `metadata.cooldownAutomation`에 기록됩니다.
   - 매 시도 결과는 `rank_api_key_audit` 감사 테이블에도 적재돼 상태(`pending`/`retrying`/`succeeded`/`manual_override`), 재시도 횟수, 런북 링크 첨부 여부, Slack/Webhook 응답 스냅샷을 장기적으로 보관합니다.
   - 각 호출의 응답 본문·JSON·HTTP 상태·소요 시간·에러 스택이 `metadata.cooldownAutomation.lastResult`에 포함되므로 재시도 정책을 세밀하게 튜닝할 수 있습니다.
   - 회수 다이제스트 실행 여부와 관계없이 Slack/Webhook 알림에 런북 링크가 첨부됐는지 `metadata.cooldownAutomation.lastDocLinkAttached` 및 `docLinkAttachmentCount`로 누적 집계되며, 대시보드 카드에서도 바로 확인할 수 있습니다.

3. **수동 다이제스트 (백업 경로)**
   - 실시간 경보가 실패한(즉, `notified_at IS NULL`) 레코드를 주기적으로 확인하고 필요할 때 `/api/rank/cooldown-digest`를 수동 호출합니다.
   - 호출 시 `runCooldownAutomation`이 Slack/Webhook → 자동 키 교체 순으로 재시도하며, 성공하면 `notified_at`을 현재 시각으로 업데이트합니다.
   - 각 다이제스트 실행 역시 `rank_api_key_audit`에 기록돼 수동 회수 윈도우, 호출 메소드, 남은 노트와 함께 감사 로그로 남습니다.
   - 반복 작업이 필요하다면 사내에서 운영 중인 별도 스케줄러나 배치 파이프라인에 엔드포인트 호출을 추가하세요(공용 유료 Cron 서비스는 사용하지 않습니다).
   - 응답은 `processed`, `delivered`, `windowMinutes` 정보를 JSON으로 반환합니다.

4. **Telemetry 리포트 & 대시보드**
  - `/api/rank/cooldown-telemetry`는 `metadata.cooldownAutomation`을 모아 백오프와 가중치를 분석할 수 있는 요약 통계를 제공합니다.
  - 응답에는 전체·제공자별 시도 수, 추정 실패율, 평균 지속시간, 권장 백오프/가중치, 최근 시도(`latestAttempts`), 현재 쿨다운 중인 키(`triggeredCooldowns`)가 포함됩니다.
  - `docLinkAttachmentCount`, `docLinkAttachmentRate`, `lastDocLinkAttachmentRate` 필드로 런북 링크 첨부 누적 횟수와 최신 시도 대비 첨부율을 확인할 수 있으며, `latestAttempts[].docLinkAttached`는 경보가 문서 링크 없이 발송된 경우 바로 경고로 표기됩니다.
  - `latestLimit` 쿼리 파라미터로 최근 시도 목록 길이를 조정할 수 있으며 최대 50개까지 허용됩니다.
  - 응답의 `alerts` 필드는 기본 임계값(실패 비율 25%/45%, 쿨다운 비중 20%/40%, 알림 30초/60초, 교체 60초/180초, 연속 재시도 3/5회, 런북 링크 첨부율 85%/65%, 최신 첨부율 90%/70%)을 적용해 위험도(`ok`/`warning`/`critical`)를 판별합니다.
  - 관리자 포털(`/admin/portal`)에 **API 키 쿨다운 대시보드**가 추가돼 전체 요약, 제공자별 테이블, 최근 시도, 임계값을 시각적으로 확인할 수 있습니다.
  - 요약 카드 중 “현재 쿨다운 키”는 `ETA 새로고침` 버튼으로 수동 계산을 트리거하며, 최신으로 불러온 `cooldown-retry-schedule` 추천 ETA를 함께 표기해 Edge Function이 다음으로 실행될 시점을 운영자가 확인할 수 있습니다.
  - 제공자 테이블에는 `다음 재시도 ETA` 열이 추가돼 각 제공자의 활성 쿨다운 키가 언제 다시 자동화될 예정인지 한눈에 비교할 수 있습니다.
  - 임계값 패널은 게이지 카드로 현재 지표와 경고/위험 구간을 나란히 표시해 런북 링크 첨부율·실패율·평균 소요 시간의 추세를 즉시 읽어낼 수 있습니다.
  - 임계값을 넘어선 항목은 즉시 강조되며, 각 이슈에 대해 재시도 정책 변경·키 교체 우선순위를 결정할 수 있습니다.
  - **쿨다운 장기 분석 보드**에서는 기간·집계 단위(일/주/월)·제공자·사유 필터를 적용해 주간·월간 추세와 제공자/사유별 누적 지표, 최근 이벤트를 비교할 수 있습니다.
  - 분석 보드의 요약 카드와 기간별 테이블은 실패율, 경보 성공률, 평균 알림/회복 소요 시간을 함께 보여 주므로 백오프·가중치 조정 논의를 빠르게 진행할 수 있습니다.
  - 관리자 모드에는 `rank_battle_logs` 기반 **언어 성능 인사이트** 패널이 추가돼 단어별 사용량, 승률 상관관계, OP 문장 티어리스트를 통해 Slack 경보 문구 개선이나 전투 대화 품질을 정량적으로 분석할 수 있습니다.
  - 필터 컨트롤에서 전투 로그 표본 크기(최근 100~1000건)와 특정 게임·시즌을 선택해 샘플을 좁혀 보면 운영 팀이 시즌 이벤트나 개별 게임의 문구 품질을 독립적으로 비교할 수 있습니다.
  - 제공자 테이블과 최근 자동화 시도 목록에는 CSV 내보내기 버튼이 추가돼 현재 표시된 지표를 그대로 내려받을 수 있습니다. 내보내기 시 대시보드에서 선택한 `latestLimit` 값이 그대로 적용돼 운영팀과 QA가 동일한 샘플을 공유할 수 있습니다.
  - 자주 사용하는 조합은 대시보드 내 즐겨찾기 입력에서 저장할 수 있고, 복사 버튼으로 현재/즐겨찾기 필터를 공유 링크로 만들 수 있어 팀원 간 재현성이 높아집니다.

## 감사 로그 스냅샷

- `rank_api_key_audit` 테이블은 각 경보 실행(실시간·다이제스트) 결과를 시계열로 보관합니다.
- 컬럼 구성: `status`, `retry_count`, `last_attempt_at`, `next_retry_eta`, `doc_link_attached`, `automation_payload`, `digest_payload`, `notes`.
- `automation_payload`에는 Slack/Webhook HTTP 스냅샷, 자동 키 회전 응답, 런북 링크 첨부 여부가 JSON으로 기록됩니다.
- `digest_payload`는 수동 호출 창(`windowMinutes`), limit, HTTP 메서드를 담아 어떤 재시도 창에서 복구가 이루어졌는지 추적할 수 있게 합니다.
- 대시보드의 회수 타임라인, 운영 회고, 회수 실패 분석에서 이 테이블을 그대로 참조해 재시도 흐름과 문서 첨부 이력을 동시에 검토할 수 있습니다.

## 운영 절차

1. **테이블 생성**
   ```sql
    create table public.rank_api_key_cooldowns (
      id uuid primary key default gen_random_uuid(),
      key_hash text not null,
      key_sample text,
      reason text,
      provider text,
      viewer_id uuid,
      game_id uuid,
      session_id uuid,
      recorded_at timestamptz not null,
      expires_at timestamptz not null,
      reported_at timestamptz not null,
      notified_at timestamptz,
      source text not null default 'client_local',
      note text,
      metadata jsonb default '{}'::jsonb,
      inserted_at timestamptz not null default now()
    );

   create unique index rank_api_key_cooldowns_key_hash_idx on public.rank_api_key_cooldowns (key_hash);
   create index rank_api_key_cooldowns_notified_idx on public.rank_api_key_cooldowns (notified_at, recorded_at desc);
   ```
   - RLS 정책: 서비스 롤만 삽입/갱신 가능하도록 제한하고, 일반 사용자는 조회할 수 없습니다.

2. **환경 변수**
   - `SUPABASE_SERVICE_ROLE`: 서버 라우터가 테이블에 삽입/갱신할 때 사용하는 서비스 롤 키.
   - `RANK_COOLDOWN_ALERT_WEBHOOK_URL`: Slack 또는 기타 Webhook 엔드포인트 URL. 설정 시 실시간 경보가 바로 발송됩니다.
   - `RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION` *(선택)*: Webhook 호출에 사용할 `Authorization` 헤더 값.
   - `RANK_COOLDOWN_ALERT_DOC_URL` *(선택)*: Slack/Webhook 경보에 자동 첨부할 운영 가이드 문서 URL. 미설정 시 저장소 기본 링크가 사용됩니다.
   - `RANK_COOLDOWN_ROTATION_URL`: 고갈된 키를 교체하거나 비활성화할 자동화 스크립트 엔드포인트.
   - `RANK_COOLDOWN_ROTATION_SECRET` *(선택)*: 자동화 엔드포인트 호출 시 사용할 비밀 토큰. 기본적으로 `Authorization` 헤더에 주입됩니다.
   - `RANK_COOLDOWN_ROTATION_PROVIDER_FILTER` *(선택)*: 특정 제공자일 때만 자동 교체를 실행하고 싶을 때 소문자 제공자 명칭을 입력합니다.

3. **알림·자동화 연동**
   - 위 환경 변수를 설정하면 `/api/rank/cooldown-report`가 Slack/Webhook 경보와 키 교체 자동화 요청을 즉시 발송합니다.
   - 실시간 경보가 실패하거나 환경 변수가 비어 있으면 운영자가 `/api/rank/cooldown-digest`를 호출해 동일한 경로를 재시도합니다(선택적으로 자체 스케줄러에 배치해도 됩니다).
   - 자동화 엔드포인트에는 `type: "rank.cooldown.rotation_request"`와 함께 `event` 상세 정보(JSON)가 전달되므로, 서버리스 함수나 백오피스 스크립트에서 이를 파싱해 키 교체를 수행하세요.

### Webhook 재시도 전략 (2025-11-07 업데이트)
- **재시도 간격**: 최초 실패 후 3분 → 5분 → 10분 백오프로 최대 3회까지 Edge Function이 재시도합니다.
- **재시도 한계**: 3회 모두 실패하면 `metadata.cooldownAutomation.retryState`에 실패 이력과 마지막 HTTP 상태 코드를 저장하고, `notified_at`을 비워 둔 채 관리자 대시보드에 경고 배너를 띄웁니다.
- **대체 경로**: 실패 시 즉시 `/api/rank/cooldown-digest` 호출을 큐에 넣어 별도 스케줄러가 회수할 수 있게 하고, Webhook URL이 빈 값이면 재시도 루프를 건너뜁니다.
- **운영 알림**: Edge Function은 세 번째 실패 후 60초 이내에 Slack 운영 채널에 “manual rotation required” 경보를 발송하고, Webhook URL/HTTP 상태/실패 시각을 첨부합니다.

### Edge Function 백오프 스케줄러 (2025-11-08 업데이트)
- **동적 백오프 계산**: `GET /api/rank/cooldown-retry-schedule`은 `cooldownId` 또는 `keyHash`를 받아 `rank_api_key_audit` 감사 로그를 조회하고, 최근 실패 스트릭·평균 응답 시간·문서 첨부율을 기반으로 다음 재시도 지연(`recommendedDelayMs`)과 실행 시각(`recommendedRunAt`)을 반환합니다. 실패율이 높거나 응답 시간이 길어질수록 기본 3/5/10분 간격을 가중치(최대 30분)와 지터(5~45초)로 조정합니다.
- **감사 로그 연동**: 응답의 `plan.auditTrail`에는 최근 10건의 시도 상태, HTTP 지속 시간, 문서 첨부 여부가 포함돼 Edge Function이 동일한 데이터를 참고해 재시도 여부를 결정할 수 있습니다. `summary.failureRate`와 `docLinkAttachmentRate`는 대시보드·텔레메트리 지표와 동일한 방식으로 계산됩니다.
- **재시도 중단 조건**: 최신 감사 로그가 `succeeded` 혹은 `manual_override`이면 `shouldRetry: false`와 함께 중단 사유가 표기되며, 연속 실패가 3회를 넘으면 `max_retries_exhausted`로 더 이상 스케줄을 제안하지 않습니다. 감사 로그나 `metadata.cooldownAutomation.retryState.nextRetryAt`에 예약된 ETA가 있으면 해당 시각 이후로 자동 조정됩니다.
- **활용 예시**: Edge Function 재시도 전 운영자가 필요할 때마다 대시보드의 `ETA 새로고침`을 눌러 API를 수동 호출하고(`GET /api/rank/cooldown-retry-schedule`), `plan.shouldRetry`가 `true`이고 `recommendedDelayMs`가 제공될 때만 후속 재시도 일정을 갱신합니다. 자동 루프 대신 필요한 순간에만 새로고침해 비용을 통제할 수 있습니다.

### 경보 임계값 오버라이드 (2025-11-08 업데이트)
- **기본값 출처**: `config/rank/cooldownAlertThresholds.js`에 정의된 값이 기본 경보 기준으로 사용됩니다. `failureRate`, `triggeredRatio`, `docLinkAttachmentRate` 등 모든 항목이 동일한 구조를 공유합니다.
- **환경 변수 제어**: 서버 환경에서 `RANK_COOLDOWN_ALERT_THRESHOLDS`를 JSON 문자열로 지정하면 원하는 항목만 선택적으로 덮어쓸 수 있습니다. 예) `{ "failureRate": { "warning": 0.3, "critical": 0.5 } }`
- **비활성화**: 특정 임계값을 비교하지 않으려면 해당 `warning` 또는 `critical` 값을 `null`로 지정합니다. 파싱에 실패하면 경고가 로그(`console.warn`)로 남고 기본값이 그대로 적용됩니다.
- **가시성**: API 응답(`GET /api/rank/cooldown-telemetry`)과 관리자 대시보드는 적용된 임계값을 그대로 노출해 현행 기준이 문서·UI와 일치하도록 유지됩니다.
- **감사·알림 경로 (2025-11-08 업데이트)**: 임계값이 변경될 때마다 `lib/rank/cooldownAlertThresholds.js`가 감사 트레일에 기록하고, `RANK_COOLDOWN_ALERT_AUDIT_WEBHOOK_URL`이 설정된 경우 Slack/Webhook으로 변경 내역을 전송합니다. 감사 알림에는 바뀐 지표와 이전/이후 값이 요약돼 운영자가 배포 히스토리를 재현할 수 있습니다.
- **Webhook 선택 순서**: 감사용 Webhook이 설정되지 않은 경우 일반 경보용 Webhook(`RANK_COOLDOWN_ALERT_WEBHOOK_URL` → `SLACK_COOLDOWN_ALERT_WEBHOOK_URL`)과 동일한 경로로 알림이 전달됩니다. 별도 채널로 분리하고 싶다면 감사 전용 URL·토큰을 등록하세요.

### Retry 상태 추적 및 대시보드 연동 (2025-11-07 업데이트)
- **상태 머신**: `pending` → `retrying (n=1~3)` → `succeeded | failed` 단계별로 `metadata.cooldownAutomation.retryState`에 `attempt`, `nextRetryAt`, `lastResult` 필드를 누적해 JSON으로 저장합니다.
- **대시보드 필드**: 관리자 포털 대시보드 카드에 `retryStatus`, `lastFailureAt`, `nextRetryEta`, `attemptCount` 컬럼을 추가해 실시간 모니터링이 가능하도록 했습니다.
- **Slack 요약**: Edge Function이 각 재시도 결과를 Slack 스레드에 요약해 공유하고, 실패 시 `(결)` 태그를 붙여 회고 시 쉽게 필터링할 수 있습니다. 메시지에는 자동으로 `Edge Webhook Retry Runbook` 링크와 다음 자동 재시도 ETA가 첨부돼 후속 대응 문서와 재시도 일정을 동시에 확인할 수 있습니다.
- **수동 회수 루틴**: `/api/rank/cooldown-digest`가 성공적으로 경보를 전달하면 Edge Function이 남긴 실패 메모를 `metadata.cooldownAutomation.digestRecovery` 필드에 적재해 추후 회고에 활용합니다.

## 향후 TODO

 - (선택) CSV 내보내기 결과를 자동으로 팀 드라이브에 업로드할 Google Sheets 연동 스크립트 검토.

느낀 점: 대시보드와 장기 분석 보드를 함께 두니 당장 조치할 항목과 장기적인 위험 신호를 동시에 살필 수 있어 운영이 훨씬 든든해졌습니다.
추가로 필요한 점: 분석 보드에서 본 지표를 바로 백필 스프레드시트로 넘길 수 있는 내보내기 기능이 있다면 협업 속도가 더 빨라질 것 같습니다.
진행사항: 실시간 대시보드에 이어 장기 추세 분석 보드를 구축하고, 문서에 활용법과 남은 과제를 반영했습니다.
