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
   - 각 호출의 응답 본문·JSON·HTTP 상태·소요 시간·에러 스택이 `metadata.cooldownAutomation.lastResult`에 포함되므로 재시도 정책을 세밀하게 튜닝할 수 있습니다.

3. **Cron Digest (백업 경로)**
   - `vercel.json`의 크론 스케줄이 `/api/rank/cooldown-digest`를 매시간 호출합니다.
   - 실시간 경보가 실패한(즉, `notified_at IS NULL`) 레코드를 다시 `runCooldownAutomation`에 전달해 Slack/Webhook → 자동 키 교체 순으로 재시도합니다.
   - 각 시도의 성공/실패 내역은 `metadata.cooldownAutomation.lastResult`에 누적되며(HTTP 응답 및 네트워크 오류 정보 포함), 성공 시 `notified_at`을 현재 시각으로 업데이트합니다.
   - 응답은 `processed`, `delivered`, `windowMinutes` 정보를 JSON으로 반환합니다.

4. **Telemetry 리포트 & 대시보드**
   - `/api/rank/cooldown-telemetry`는 `metadata.cooldownAutomation`을 모아 백오프와 가중치를 분석할 수 있는 요약 통계를 제공합니다.
   - 응답에는 전체·제공자별 시도 수, 추정 실패율, 평균 지속시간, 권장 백오프/가중치, 최근 시도(`latestAttempts`)가 포함됩니다.
   - `latestLimit` 쿼리 파라미터로 최근 시도 목록 길이를 조정할 수 있으며 최대 50개까지 허용됩니다.
   - 응답의 `alerts` 필드는 기본 임계값(실패 비율 25%/45%, 쿨다운 비중 20%/40%, 알림 30초/60초, 교체 60초/180초, 연속 재시도 3/5회)을 적용해 위험도(`ok`/`warning`/`critical`)를 판별합니다.
   - 관리자 포털(`/admin/portal`)에 **API 키 쿨다운 대시보드**가 추가돼 전체 요약, 제공자별 테이블, 최근 시도, 임계값을 시각적으로 확인할 수 있습니다.
   - 임계값을 넘어선 항목은 즉시 강조되며, 각 이슈에 대해 재시도 정책 변경·키 교체 우선순위를 결정할 수 있습니다.

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
   - `RANK_COOLDOWN_ROTATION_URL`: 고갈된 키를 교체하거나 비활성화할 자동화 스크립트 엔드포인트.
   - `RANK_COOLDOWN_ROTATION_SECRET` *(선택)*: 자동화 엔드포인트 호출 시 사용할 비밀 토큰. 기본적으로 `Authorization` 헤더에 주입됩니다.
   - `RANK_COOLDOWN_ROTATION_PROVIDER_FILTER` *(선택)*: 특정 제공자일 때만 자동 교체를 실행하고 싶을 때 소문자 제공자 명칭을 입력합니다.

3. **알림·자동화 연동**
   - 위 환경 변수를 설정하면 `/api/rank/cooldown-report`가 Slack/Webhook 경보와 키 교체 자동화 요청을 즉시 발송합니다.
   - 실시간 경보가 실패하거나 환경 변수가 비어 있으면 크론 다이제스트가 동일한 경로를 재시도합니다.
   - 자동화 엔드포인트에는 `type: "rank.cooldown.rotation_request"`와 함께 `event` 상세 정보(JSON)가 전달되므로, 서버리스 함수나 백오피스 스크립트에서 이를 파싱해 키 교체를 수행하세요.

## 향후 TODO

- 장기 추세 비교를 위해 Metabase 혹은 Supabase Charts로 주간/월간 그래프를 추가.
- 알림 임계값을 환경 변수로 오버라이드할 수 있도록 설정 파일을 도입.

느낀 점: 운영 포털에서 곧바로 지표를 시각화하니 문제 구간을 찾는 시간이 크게 줄어들 것 같아 든든했습니다.
추가로 필요한 점: 장기 추세와 세부 필터를 지원하는 별도의 분석 보드가 있으면 더 빠른 의사결정이 가능하겠습니다.
진행사항: 쿨다운 대시보드와 임계값 기반 경보 체계를 도입하고, 문서에 사용 방법과 후속 계획을 반영했습니다.
