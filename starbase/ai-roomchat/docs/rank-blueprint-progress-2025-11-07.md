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
- `RANK_COOLDOWN_ALERT_THRESHOLDS`가 바뀔 때 감사 트레일과 Slack/Webhook 알림에 이전/이후 값이 기록되도록 임계값 감사 흐름을 연결했습니다.
- 텔레메트리 응답과 대시보드에 임계값 감사 이력을 집계해 최근 변경 횟수·마지막 조정 요약을 한 번에 확인할 수 있도록 `thresholdAudit` 요약과 감사 로그 패널을 추가했습니다.
- 임계값 감사 타임라인에 일간/주간/월간 전환 토글을 제공해 단기·장기 변경 추세를 한 번에 비교할 수 있도록 그래프를 확장했습니다.
- 감사 타임라인에서 선택한 모드를 CSV·PNG로 바로 내보낼 수 있게 하여 주간 보고나 회고 자료에 데이터를 즉시 삽입할 수 있습니다.
- 타임라인 CSV/PNG를 내려받으면 동일한 파일이 팀 드라이브(또는 지정한 공유 디렉터리)에 자동 업로드돼 공유 루틴이 바로 이어집니다.
- 텔레메트리에 `timelineUploads` 요약과 업로드 감사 테이블을 연결해 24시간·7일 업로드 성공 횟수, 마지막 성공 시각, 실패/건너뜀 내역을 대시보드 카드와 최근 업로드 패널에서 확인할 수 있습니다.
- 업로드 연속 실패와 마지막 성공 이후 경과 시간을 비교하는 임계값을 정의해 타임라인 업로드 실패가 장기화되면 경고/위험 알림으로 승격시키고, 동일 기준을 대시보드 카드·이슈 패널에 노출했습니다.

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
- StartClient 로그 보드의 모바일 히스토리 패널을 세로 스택으로 재배치하고, 데스크톱에서는 다단 그리드로 확장해 로그/히스토리 카드가 화면 크기에 맞춰 정렬되도록 CSS를 조정했습니다. 추가로 섹션별 축약 토글·검색 입력에 더해 검색어 하이라이트와 액션/주역/태그 다중 필터 칩을 붙여 긴 전투에서도 필요한 카드만 빠르게 찾아볼 수 있게 했습니다.【F:components/rank/StartClient/LogsPanel.js†L1-L400】【F:components/rank/StartClient/LogsPanel.module.css†L1-L360】
- `rank_api_key_audit` 테이블 초안을 정리해 만료 알림/회복 과정에서 발생한 회수 이력을 JSON으로 보관하도록 정의하고, Edge Function 재시도 로그와 어떤 필드를 교차 참조할지 문서화했습니다.
- Edge Function 재시도 스케줄러가 감사 로그와 텔레메트리 집계를 활용해 다음 재시도 ETA/지연 시간을 추천하도록 `cooldown-retry-schedule` API와 문서를 보강했습니다.
- `/api/rank/run-turn`·`/api/rank/log-turn` API에 `is_visible`·`summary_payload` 적재 로직을 연결하고, 세션 히스토리 응답에 요약 데이터·숨김 카운트를 노출하도록 해 단계 2 로그 파이프라인 요구사항을 실제 코드에 반영했습니다.
- `/api/rank/cooldown-report`와 `/api/rank/cooldown-digest`가 쿨다운 자동화 결과를 `rank_api_key_audit` 감사 테이블에 적재하도록 확장돼 운영 가드 단계의 남은 TODO를 해소했습니다.
- 요약 카드에서 `ETA 새로고침`을 눌러 `cooldown-retry-schedule` ETA를 불러오도록 조정해, 운영 대시보드에서도 수동 갱신으로 다음 Edge Function 실행 시간을 확인할 수 있게 했습니다.
- Slack/Webhook 경보에 자동 ETA 안내를 추가하고, 제공자 테이블 `다음 재시도 ETA` 열로 운영 대시보드에서 재시도 일정을 비교할 수 있도록 했습니다.
- 쿨다운 경보 임계값을 `config/rank/cooldownAlertThresholds.js`로 분리하고 `RANK_COOLDOWN_ALERT_THRESHOLDS` 환경 변수로 오버라이드할 수 있게 해 운영팀이 필요 시 기준을 즉시 조정하도록 했습니다.
- 임계값 변경 시 `cooldownAlertThresholds` 로더가 감사 트레일과 Slack/Webhook 알림으로 이전/이후 값을 공유해 환경 변수 조정 이력을 추적할 수 있도록 했습니다.
- 텔레메트리 응답에 `thresholdAudit`을 추가하고 대시보드에 임계값 변경 카드·감사 로그 패널을 노출해 운영팀이 최근 변경 이력을 실시간으로 확인할 수 있게 했습니다.
- `thresholdAudit.timelines`로 일간/주간/월간 버킷을 노출해 대시보드 타임라인 그래프가 모드를 전환하며 동일 데이터를 사용할 수 있도록 확장했습니다.
- 타임라인 컨트롤 옆 CSV/PNG 버튼을 통해 선택한 모드 데이터를 보고서·슬라이드로 바로 내보낼 수 있게 정리했습니다.
- 내보내기와 동시에 `/api/rank/upload-cooldown-timeline`이 팀 드라이브 업로드를 수행해 Slack 공유 없이도 운영팀이 최신 보고 파일을 열람할 수 있습니다.
- `/api/rank/upload-cooldown-timeline` 요청이 업로드 결과를 `rank_cooldown_timeline_uploads`에 기록하도록 하고, 텔레메트리 `timelineUploads` 요약과 대시보드 업로드 현황 패널을 추가해 누락된 공유 구간을 바로 파악할 수 있습니다.
- 업로드 연속 실패/장기 미성공 임계값을 `cooldownAlertThresholds`와 텔레메트리 경보(`alerts.timelineUploads`)에 연결해 카드·이슈 패널·CSV 내보내기에서도 동일한 경고를 표시하도록 정비했습니다.
- 랜딩 히어로에 청사진 주요 단계 진행률(매칭 트리거 통일, 세션/전투 동기화, 프롬프트 변수 자동화, UI·오디오 완성, 운영 가드)을 2025-11-07 기준으로 노출하는 보드를 추가하고, 진행률 데이터를 `data/rankBlueprintProgress.json`으로 분리해 업데이트 시 문서/코드 동기화를 간소화했습니다. `npm run refresh:blueprint-progress` 스크립트가 개요 문서의 표를 읽어 JSON을 재생성하도록 연결해 후속 갱신도 한 번에 처리할 수 있고, `npm run check:blueprint-progress-freshness` + 주 1회 GitHub Actions·PR/메인 푸시 CI 리마인더로 14일이 지나기 전에 자동 경고를 받습니다. 같은 워크플로가 `npm test -- --runInBand`와 `CI=1 npm run build`를 수행하면서 `.next/cache`를 복원/보존하고 `jest-junit` 리포트를 업로드, Step Summary에 테스트 매트릭을 게시해 에러 리포트 파이프라인 회귀 감지뿐 아니라 실행 시간 병목을 추적할 수 있게 했습니다.【F:.github/workflows/blueprint-progress-freshness.yml†L1-L47】【F:.github/workflows/pr-ci.yml†L1-L42】
- 같은 흐름으로 "다음 액션 스냅샷" 섹션도 `data/rankBlueprintNextActions.json`으로 추출해 랜딩 히어로에 진행률 보드 옆 체크리스트 카드를 노출했습니다. 담당자와 목표일을 표 형태로 관리해 JSON에도 `owner`·`targetDateISO` 메타가 포함되고, 랜딩 카드에서 D-Day 뱃지·컬러 상태로 우선순위가 드러나도록 구성했습니다.【F:.github/workflows/blueprint-progress-freshness.yml†L1-L33】【F:.github/workflows/pr-ci.yml†L1-L28】 최신 업데이트 시각은 진행률 카드와 동일한 뱃지를 공유하며, `npm run refresh:blueprint-progress`를 실행하면 두 JSON이 동시에 갱신됩니다.
- 자동 경고 흐름을 확장해 다음 액션 표에서 담당자 키와 목표일 메타를 파싱하면서 JSON에 기한 상태(D-Day, 연체 여부, 남은 일수)를 기록하고, 개요 문서에는 경고 블록을 자동 삽입하도록 스크립트를 보강했습니다. 주간 GitHub Actions와 PR/메인 푸시 CI는 `npm run check:blueprint-next-actions`를 함께 실행해 마감이 지나면 즉시 실패하도록 구성했습니다.
- 다음 액션 JSON에 `priority`·`effort` 메타를 추출하고 랜딩 카드에 우선순위 뱃지, 예상 리소스 칩, 정렬 토글(우선순위/기한/목록순)을 추가해 청사진 표와 동일 기준으로 우선순위와 공수 정보를 비교할 수 있게 했습니다.
- 클라이언트 전역에 오류 리포터를 두고 `/api/errors/report`로 전송되도록 한 뒤, 관리자 포털에서 `/api/admin/errors`를 통해 최신 오류를 집계·표시하는 모니터 패널을 추가해 사용자 피드백 루프를 단축했습니다.
- **룸 BGM 연동**: `GameRoomView`가 공유 오디오 매니저를 부팅해 뷰어/호스트/참가자의 브금 중 가용한 트랙을 자동 재생하고, 방을 떠날 때 baseline 상태를 복구하도록 정리했습니다. 히어로 패널에는 현재 브금 카드가 추가돼 트랙 길이와 출처를 바로 확인할 수 있습니다.【F:components/rank/GameRoomView.js†L497-L620】【F:components/rank/GameRoomView.js†L2369-L2419】【F:components/rank/GameRoomView.module.css†L908-L940】
- **BGM 컨트롤러**: 히어로 패널의 브금 카드에 재생/일시정지 토글, 음소거 전환, 볼륨 슬라이더, 진행 막대를 추가해 운영자가 바로 우선순위를 파악하고 음량을 조정할 수 있습니다. 모바일에서는 버튼이 세로로 재배치돼 터치 조작도 수월합니다.【F:components/rank/GameRoomView.js†L497-L687】【F:components/rank/GameRoomView.js†L2369-L2438】【F:components/rank/GameRoomView.module.css†L908-L1048】【F:components/rank/GameRoomView.module.css†L1835-L1857】
- **StartClient 로그 보드**: 전투 턴 로그가 요약/태그/프롬프트 프리뷰와 함께 카드화되고, 모바일에서는 히스토리 패널이 세로 스택으로 재배치되며 데스크톱에서는 다단 그리드로 확장돼 운영/QA가 화면 크기에 맞춰 문맥을 확인할 수 있습니다. 섹션별 축약 토글·검색 입력, 검색어 하이라이트, 액션/주역/태그 다중 필터 칩으로 카드가 길어져도 필요한 항목만 빠르게 추릴 수 있습니다.【F:components/rank/StartClient/LogsPanel.js†L1-L400】【F:components/rank/StartClient/LogsPanel.module.css†L1-L360】【F:components/rank/StartClient/useStartClientEngine.js†L960-L1206】
- **단계 진행도 갱신**: 오디오 연동이 자리 잡으면서 UI·오디오 단계 진행률이 45%까지 상승했고, 전체 청사진 진행도 추산도 약 65%로 함께 업데이트했습니다.【F:docs/rank-blueprint-overview.md†L18-L70】

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
| T+253m | 경보 임계값을 환경 변수로 조정할 수 있도록 설정 로더를 추가하고, 문서·대시보드에 적용된 수치를 그대로 노출하는 경로를 확인했습니다. |
| T+261m | 임계값 로더가 이전/이후 값을 비교해 감사 트레일을 기록하고 Slack/Webhook으로 알림을 보내도록 연결해 환경 변수 변경 이력이 즉시 공유되도록 했습니다. |
| T+269m | 텔레메트리 응답에 `thresholdAudit` 요약을 추가하고 대시보드 카드로 최근 변경 횟수·마지막 조정 시각을 노출했습니다. |
| T+277m | 임계값 감사 로그 패널을 작성해 변경 내역·Diff·원본 값을 한눈에 확인할 수 있도록 UI와 문서를 동시에 갱신했습니다. |
| T+285m | 감사 이벤트 타임라인 그래프를 추가해 최근 14일 변경 빈도와 오늘 이벤트를 강조 표시하도록 대시보드와 문서를 업데이트했습니다. |
| T+293m | 감사 타임라인에 CSV/PNG 내보내기 버튼을 연결하고, 운영 플레이북·API 문서·개요를 동시에 갱신해 주간 보고서에 그대로 첨부할 수 있게 확인했습니다. |
| T+301m | 내보낸 CSV/PNG가 팀 드라이브(또는 공유 디렉터리)에 자동 업로드되도록 업로드 스크립트·API를 연결하고, 실패 시 경고 문구를 확인했습니다. |
| T+309m | `/api/rank/upload-cooldown-timeline` 호출 시 업로드 성공/실패 상태를 `rank_cooldown_timeline_uploads`에 적재하도록 로깅을 추가했습니다. |
| T+317m | 텔레메트리 응답에 `timelineUploads` 요약을 포함하고 대시보드 카드·최근 업로드 패널에서 24시간·7일 성공 횟수와 실패/건너뜀 내역을 시각화했습니다. |
| T+325m | 업로드 연속 실패(2/4회)·장기 미성공(6/12시간) 임계값을 정의해 `alerts.timelineUploads`가 경고/위험 신호로 승격되도록 하고, 대시보드 카드/이슈 패널/CSV 내보내기에도 동일 기준을 노출했습니다. |
