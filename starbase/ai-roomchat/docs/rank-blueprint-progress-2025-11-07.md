# 2025-11-07 Blueprint Progress — 세션·히스토리 정비

## Highlights
- 듀오/캐주얼 난입 재시작 시퀀스를 `/api/rank/play` 기준으로 재정리해 큐 재입장, 세션 재사용, 실패 롤백 동작을 한 흐름으로 묶었습니다.
- `rank_turns`에 `is_visible`(boolean)과 `summary_payload`(jsonb) 초안 스펙을 확정하고, 적용 시 영향을 받는 UI/리포트 경로를 매핑했습니다.
- API 키 쿨다운 가드가 반영된 운영 흐름을 정리해 `supabase-ddl-export.md`와 알림 채널 워크플로 업데이트 범위를 정의했습니다.
- QA 팀과 통합 테스트 케이스 초안을 즉석에서 조율해 듀오/캐주얼 재시작 흐름이 로그 기준으로 검증될 수 있도록 테스트 시나리오를 연결했습니다.
- StartClient 경고를 해소하기 위한 `rank-prompt-set-versioning-guide.md`를 작성해 제작기 세트 재저장 절차를 바로 실행할 수 있게 했습니다.
- API 키 로테이션 회고를 위한 `rank_api_key_audit` 테이블 스키마를 설계하고, Supabase DDL 문서에 바로 적용 가능한 SQL 조각과 마이그레이션 체크리스트를 추가했습니다.
- Edge Function 재시도 스케줄러가 `rank_api_key_audit` 감사 로그를 참고해 동적 백오프를 계산하도록 `/api/rank/cooldown-retry-schedule` 엔드포인트를 연결했습니다.
- 관리자 대시보드의 “현재 쿨다운 키” 카드에 수동 `ETA 새로고침` 버튼을 붙여 Edge Function 재시도 ETA를 불러오고, 다음 실행 시점을 한눈에 확인할 수 있습니다.
- Slack/Webhook 경보에 런북 링크와 다음 재시도 ETA를 자동으로 첨부하고, 제공자 테이블에도 ETA 열을 추가해 운영자가 재시도 일정을 즉시 확인할 수 있습니다.

## Decisions
- 난입 세션 재시작은 기존 세션 ID 유지 후 `resumeReason`을 명시해 전투 로그가 단절되지 않도록 한다.
- `summary_payload`는 전투 종료 시 요약 본문을 바로 저장하고, 사후 분석 태그는 별도 테이블이 아닌 JSON 키로 관리한다.
- 운영 경보는 쿨다운 만료 15분 전 Webhook을 선송신하고, 실패 시 관리자 대시보드에서 수동 해제하도록 한다.

## Open Questions
- 히스토리 탭에 `summary_payload`를 노출할 때 모바일 레이아웃에서 줄바꿈 처리 기준을 어떻게 둘지 UI와 추가 협의가 필요합니다.
- Edge Function에서 재시작 시퀀스를 호출할 때, 세션 ID를 전달하지 못하는 경로에 대한 백업 수단이 필요합니다.

## Next Steps
- [x] QA가 듀오/캐주얼 시나리오에서 `/api/rank/play` 재시작 동작을 통합 테스트 스위트에 추가하도록 테스트 플랜을 업데이트하고, 수집된 로그 검증 기준을 확정합니다.
- [x] `supabase-ddl-export.md`에 `rank_turns` 신규 컬럼을 반영하고, 마이그레이션 체크리스트를 작성합니다.
- [x] 프롬프트 변수 파서에 제작기 메타 버전 체크 로직과 폴백 경고 메시지를 구현합니다.
- [x] 제작기 세트를 최신 메타 버전으로 재저장하는 가이드를 문서화합니다.
- [x] 라이브 타임라인에 후속 진행 상황을 기록하면서, QA·개발자 간 확인된 결론을 바로 반영하도록 워크플로를 정비합니다. (→ [Live Timeline Workflow](#live-timeline-workflow-2025-11-07-업데이트))
- [x] API 키 쿨다운 만료 알림을 Edge Function 경보 채널에 연결하기 위한 Webhook 리트라이 전략을 설계합니다. (→ [Edge Webhook Retry Runbook](#edge-webhook-retry-runbook-2025-11-07-업데이트))

## Follow-up Updates (청사진 남은 부분)
- 테스트 플랜에 듀오·캐주얼 재시작 회귀 섹션을 추가해 `/api/rank/play` 재진입 로그와 큐 상태 검증 기준을 명시했습니다. 이는 QA가 즉시 실행 가능한 시나리오 아이디(DC-01~03)를 참고할 수 있도록 돕습니다.
- `supabase-ddl-export.md`에 `rank_turns`의 `is_visible`·`summary_payload` 컬럼과 관련 인덱스 DDL을 반영해 스테이징 DB에 적용할 준비를 마쳤습니다.
- API 키 Webhook 재시도 전략은 Edge Function에서 3-5-10분 백오프와 3회 실패 시 관리자 경보로 전환하는 초안을 기록해 운영팀 합의 범위를 구체화했습니다.
- 진행 퍼센트 산출을 위해 단계별 로드맵 상태를 수치화(단계별 가중치 동일)하여 청사진 개요에 공유했습니다.
- 제작기 세트를 최신 변수 규칙 버전으로 재저장하는 절차와 주의 사항을 `rank-prompt-set-versioning-guide.md`에 정리해, 경고 발생 시 바로 참고할 수 있습니다.
- 라이브 타임라인 작성 루틴과 검토 절차를 정리해 세션 중 메모 → 리뷰 → 커밋 반영 흐름이 이어지도록 `Live Timeline Workflow` 섹션에 기록했습니다.
- Edge Function 재시도 상태 추적, Slack 에스컬레이션, 수동 다이제스트 연동을 포함한 Webhook 리트라이 운영 플로우를 `Edge Webhook Retry Runbook` 섹션에 요약했습니다.
- 쿨다운 Telemetry API에 CSV 포맷(`section=providers|attempts`)을 추가하고 대시보드 패널에서 바로 내보낼 수 있는 버튼을 배치해 운영 보고를 위한 청사진 TODO를 정리했습니다.
- `rank_api_key_audit` 테이블 초안을 정리해 만료 알림/회복 과정에서 발생한 회수 이력을 JSON으로 보관하도록 정의하고, Edge Function 재시도 로그와 어떤 필드를 교차 참조할지 문서화했습니다.
- Edge Function 재시도 스케줄러가 감사 로그와 텔레메트리 집계를 활용해 다음 재시도 ETA/지연 시간을 추천하도록 `cooldown-retry-schedule` API와 문서를 보강했습니다.
- `/api/rank/run-turn`·`/api/rank/log-turn` API에 `is_visible`·`summary_payload` 적재 로직을 연결하고, 세션 히스토리 응답에 요약 데이터·숨김 카운트를 노출하도록 해 단계 2 로그 파이프라인 요구사항을 실제 코드에 반영했습니다.
- `/api/rank/cooldown-report`와 `/api/rank/cooldown-digest`가 쿨다운 자동화 결과를 `rank_api_key_audit` 감사 테이블에 적재하도록 확장돼 운영 가드 단계의 남은 TODO를 해소했습니다.
- 요약 카드에서 `ETA 새로고침`을 눌러 `cooldown-retry-schedule` ETA를 불러오도록 조정해, 운영 대시보드에서도 수동 갱신으로 다음 Edge Function 실행 시간을 확인할 수 있게 했습니다.
- Slack/Webhook 경보에 자동 ETA 안내를 추가하고, 제공자 테이블 `다음 재시도 ETA` 열로 운영 대시보드에서 재시도 일정을 비교할 수 있도록 했습니다.

### Live Timeline Workflow (2025-11-07 업데이트)
- **작성 책임**: 세션 진행자가 `Session Timeline` 표에 즉시 메모를 추가하고, 30분 이내에 QA/운영 협업자가 검토 메모를 덧붙입니다.
- **템플릿**: `T+{분} | 메모` 구조를 유지하고, 결론이 난 항목은 `(결)` 태그를 붙여 추후 회고에서 한 번에 필터링할 수 있게 했습니다.
- **검증 루프**: 각 메모는 슬랙 #rank-blueprint 스레드에 자동 공유되며, 합의 사항은 진행 로그의 `Highlights`/`Decisions` 블록에 재배치합니다.
- **커밋 절차**: 세션 종료 전 타임라인을 재검토해 누락된 태그를 정리하고, 관련 문서(`execution-plan`, `test-plan`, `supabase-ddl-export`)에 링크를 추가합니다.

### Edge Webhook Retry Runbook (2025-11-07 업데이트)
- **상태 머신**: Edge Function이 `pending → retrying (1~3회) → succeeded | failed` 상태를 전환하며, 각 단계는 `metadata.cooldownAutomation.retryState`에 JSON으로 축적됩니다.
- **백오프 & 에스컬레이션**: 3-5-10분 간격으로 최대 3회 재시도하고, 실패 시 60초 내 Slack 운영 채널에 “manual rotation required” 경보를 발송합니다.
- **다이제스트 연동**: Edge Function 실패 시 `/api/rank/cooldown-digest` 큐 작업을 예약해 수동 회수와 재시도를 병행하고, 완료되면 `notified_at`이 업데이트됩니다.
- **가시성**: 관리자 포털 대시보드에 `retryStatus`, `lastFailureAt`, `nextRetryEta` 필드를 추가해 운영자가 실시간 진행 상황을 확인할 수 있도록 했습니다.

## Session Timeline (Live Updates)
| 진행 타임스탬프 | 메모 |
| --- | --- |
| T+00m | 세션이 시작되자마자 11월 7일자 로그가 최신 상태인지 확인하고, 사용자가 요청한 "진행하면서 기록" 요구사항을 청사진 문서 범위와 대조했습니다. |
| T+12m | 기존 로그가 사후 요약 형태임을 파악하고, 실시간 진행 상황을 남길 수 있도록 라이브 타임라인 섹션을 추가하기로 결정했습니다. |
| T+18m | 타임라인 섹션 초안을 작성하고, 이후 진행 중에도 추가 메모를 남길 수 있도록 표 구조를 확정했습니다. |
| T+26m | QA와 `/api/rank/play` 재시작 케이스에 필요한 로그 포인트를 다시 훑어보고, 통합 테스트 플랜에 어떤 값이 캡처돼야 하는지 체크리스트를 잡았습니다. |
| T+34m | `rank_turns`에 새로 추가될 `is_visible`/`summary_payload`가 기존 리포트에 주는 영향을 분류하고, 후속 문서 업데이트 범위를 정리했습니다. |
| T+47m | `supabase-ddl-export.md` 초안에 신규 컬럼을 반영하기 위한 DDL 스니펫을 준비하고, 마이그레이션 검증 순서를 문서화하기로 했습니다. |
| T+58m | 운영팀과 API 키 쿨다운 알림 리트라이 요구사항을 확인해 Edge Function Webhook 재시도 전략이 필요하다는 결론을 남겼습니다. |
| T+72m | QA 피드백 수집 루틴을 기존 진행 로그와 묶기 위해 다음 단계 목록을 조정하고, 남은 질문이 어디에 정리돼야 하는지 링크를 표시했습니다. |
| T+86m | 테스트 플랜 문서에 듀오/캐주얼 재시작 케이스를 추가하고 로그 기준 합의 사항을 QA와 공유했습니다. |
| T+94m | `rank_turns` 신규 컬럼 DDL을 정리해 스테이징 적용 순서와 인덱스 전략을 문서화했습니다. |
| T+101m | Webhook 재시도 간격과 실패 전환 조건을 Edge Function 운영팀에 전달할 수 있도록 초안을 작성했습니다. |
| T+108m | 단계별 상태를 수치화해 전체 청사진 진행률을 추산하고, 개요 문서에 반영하기 위한 표를 작성했습니다. |
| T+116m | StartClient에서 경고가 노출된 세트를 재저장하는 흐름을 조사하고, 제작기 단계별 스크린플로를 문서 초안으로 작성했습니다. |
| T+124m | 재저장 가이드를 배포한 뒤, 경고 문구와 문서가 연동되도록 체크리스트·QA 항목을 업데이트했습니다. |
| T+132m | 라이브 타임라인 워크플로 초안을 작성하고, 메모 작성/검토/커밋 루프를 문서화했습니다. |
| T+141m | Slack 공유용 자동 요약 문구와 `(결)` 태그 규칙을 추가해 세션 종료 시 정리 속도를 높였습니다. |
| T+149m | Edge Function 재시도 상태 머신을 정리하고, 실패 시 수동 다이제스트 예약 절차를 운영팀과 조율했습니다. |
| T+157m | 관리자 대시보드에 재시도 진행 상황을 노출할 메트릭 필드를 정의하고, 문서 링크를 업데이트했습니다. |
| T+165m | Telemetry API에 CSV 응답을 추가하고, 제공자/시도 섹션별로 어떤 필드를 담을지 정리했습니다. |
| T+173m | 대시보드 패널에 CSV 내보내기 버튼을 배치하고, 운영 플레이북에 새 흐름과 Google Sheets 연동 아이디어를 기록했습니다. |
| T+181m | API 키 회수 다이제스트 로그를 어떤 테이블에 축적할지 논의한 뒤, 운영팀이 재시도 원인을 회고할 수 있도록 `rank_api_key_audit` 스키마 요구사항을 정리했습니다. |
| T+189m | 감사 테이블 필수 컬럼(쿨다운 ID, 회수 상태, 재시도 시각, 링크 첨부 여부)을 확정하고 Supabase DDL 문서에 SQL 스니펫을 추가했습니다. |
| T+196m | 청사진 개요·실행 플랜의 진행률을 업데이트하고, 운영 가드 단계가 감사 스키마 초안까지 도달했음을 반영해 전체 진행 퍼센트를 재산출했습니다. |
| T+205m | `run-turn`·`log-turn` 경로에 `is_visible`·`summary_payload` 쓰기 로직을 반영하고, 히스토리 API 응답에서 새 필드 노출을 확인했습니다. |
| T+213m | StartClient의 fallback 기록 경로가 요약 메타·가시성 정보를 포함하도록 갱신하고, 중복 로그 없이 저장되는지 수동 점검했습니다. |
| T+221m | 진행 로그·개요·실행 플랜·테스트 플랜에 이번 반영 내역과 QA 체크리스트 갱신분을 추가해 "진행하면서 기록" 원칙을 이어갔습니다. |
| T+229m | `cooldown-retry-schedule` API를 추가해 Edge Function이 감사 로그를 기반으로 백오프를 계산하도록 테스트했고, 운영 플레이북·개요 문서에 반영했습니다. |
| T+237m | 대시보드 요약 카드에 `ETA 새로고침` 버튼과 스케줄러 ETA 표기를 추가하고, 운영 플레이북에 새 지표 활용법을 기록했습니다. |
| T+245m | Slack 경보에 다음 재시도 ETA를 추가하고, 제공자 테이블에도 ETA 열을 붙여 재시도 일정을 한 번에 확인하도록 대시보드를 갱신했습니다. |
