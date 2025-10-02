# 랭크 게임 청사진 요약

청사진 실행 문서와 진행 리포트를 빠르게 훑고 싶을 때 참고할 수 있는 개요입니다. 전체 플랜은 `rank-blueprint-execution-plan.md`에, 일일 업데이트는 `rank-blueprint-progress-*.md`에 상세히 기록돼 있습니다.

## 1. 비전 & 핵심 지표
- **목표 경험**: 자동 매칭, 프롬프트 기반 전투, 히스토리 공유를 결합한 경쟁 모드.
- **성공 지표**
  - 매칭 성공률 95% 이상(큐 진입 → 세션 생성까지).
  - 전투 로그 누락률 1% 미만(`rank_turns` 기준).
  - 운영 알림 대응 시간 15분 이내(API 키 고갈, 큐 정지 등).

## 2. 단계별 로드맵 하이라이트
| 단계 | 핵심 산출물 | 상태 | 참고 문서 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | `/api/rank/play`-`/start-session` 일원화, 난입 동기화 | QA 검토 중 | `rank-blueprint-execution-plan.md` 7.1, `matchmaking_auto_flow_notes.md`, `rank-blueprint-progress-2025-11-07.md` (라이브 타임라인 포함) |
| 세션/전투 동기화 | `recordBattle` 다중 결과, `rank_turns` 가시성 | 설계 검토 중 | `rank-game-logic-plan.md`, `rank-turn-history-spec.md`, `rank-blueprint-progress-2025-11-07.md` |
| 프롬프트 변수 자동화 | 슬롯→변수 매핑, 제작기 메타 연동 | 진행 중 | `lib/rank/prompt.js`, `rank-blueprint-progress-2025-11-05.md`, `rank-blueprint-progress-2025-11-07.md` |
| UI·오디오 완성 | 히스토리 탭, 모바일 레이아웃, BGM 전환·컨트롤·로그 검색 | 진행 중 | `match-mode-structure.md`, `hero-bgm.md`, `components/rank/StartClient/LogsPanel.js` |
| 운영 가드 | API 키 교대, 큐 모니터링 | 진행 중 | `rank-api-key-cooldown-monitoring.md`, `slot-sweeper-schedule.md`, `rank-blueprint-progress-2025-11-06.md` |

## 3. 현재 결정 사항
- 난입 슬롯 충원 후에도 동일 세션 수명주기를 유지한다.
- 턴 로그는 `rank_turns` 단일 테이블에서 인비저블 라인까지 관리한다.
- 프롬프트 변수는 제작기 메타데이터(JSON)에서 직접 파싱해 슬롯별 상태를 동기화한다.

## 4. 리스크 & 대응 전략
- **세션 상태 불일치**: `AutoMatchProgress` ↔ `useGameRoom` 동기화 테스트를 E2E로 보강.
- **프롬프트 변수 누락**: 제작기 노드 내보내기 스키마 변경 시 CLI 검증을 의무화.
- **운영 부하**: API 키 교대/알림 자동화를 Edge Function으로 이관.

## 5. 최근 진행 스냅샷 (2025-11-07)
- [2025-11-07 진행 로그](rank-blueprint-progress-2025-11-07.md): 듀오/캐주얼 `/api/rank/play` 재시작 시퀀스와 큐 동기화 케이스를 정리해 QA 검증을 준비하고, `rank_turns` 가시성·요약 컬럼 초안을 도출했습니다. 이번부터는 라이브 타임라인을 병행해 진행 중인 메모가 곧바로 누적됩니다.
- [턴 로그 요약 파이프라인](rank-blueprint-progress-2025-11-07.md#session-timeline-live-updates): `/api/rank/run-turn`·`/api/rank/log-turn`이 `is_visible`·`summary_payload`를 채우고, 세션 히스토리 API가 요약/숨김 정보를 함께 반환하도록 구현해 단계 2의 로그 파이프라인을 실제 코드에 연결했습니다.
- [프롬프트 세트 재저장 가이드](rank-prompt-set-versioning-guide.md): StartClient 경고 메시지에 맞춘 제작기 재저장 절차와 검증 체크리스트를 문서화해 누구나 즉시 대응할 수 있습니다.
- [2025-11-06 진행 로그](rank-blueprint-progress-2025-11-06.md): API 키 쿨다운 가드를 도입하고 운영 대시보드 경보를 연동했습니다.
- [2025-11-05 진행 로그](rank-blueprint-progress-2025-11-05.md): 롤백 이후 기준 상태를 재확인하고 실행 플랜 체크리스트를 재정렬했습니다.
- [쿨다운 Telemetry CSV 내보내기](rank-api-key-cooldown-monitoring.md#운영-절차): 제공자/최근 시도 데이터를 바로 내려받는 버튼과 API 포맷을 정리해 운영 보고서 공유 루틴을 단축했습니다.
- [쿨다운 ETA 요약 카드](rank-api-key-cooldown-monitoring.md#edge-function-백오프-스케줄러-2025-11-08-업데이트): 관리자 대시보드 요약 카드가 수동 `ETA 새로고침` 버튼으로 `cooldown-retry-schedule` 추천 ETA를 불러와 다음 Edge Function 실행 시점을 안내합니다.
- [Slack 경보 ETA & 제공자 테이블](rank-api-key-cooldown-monitoring.md): Slack/Webhook 경보가 다음 재시도 ETA를 안내하고, 제공자 테이블에도 ETA 열이 추가돼 운영 대응이 빨라졌습니다.
- [쿨다운 감사 로그 적재](rank-blueprint-progress-2025-11-06.md#next-steps): `/api/rank/cooldown-report`·`/api/rank/cooldown-digest`가 `rank_api_key_audit`에 자동화 결과를 남겨 재시도 이력을 문서화하도록 확장했습니다.
- [경보 임계값 오버라이드](rank-api-key-cool다운-monitoring.md#경보-임계값-오버라이드-2025-11-08-업데이트): `RANK_COOLDOWN_ALERT_THRESHOLDS` 환경 변수로 경보 기준을 조정할 수 있어 운영 대응 기준을 시기별로 맞출 수 있습니다.
- [임계값 감사 알림 & Slack 통지](rank-api-key-cool다운-monitoring.md#경보-임계값-오버라이드-2025-11-08-업데이트): 임계값이 바뀌면 감사 트레일과 Slack/Webhook 알림에 이전/이후 값이 기록돼 환경 변수 조정 이력을 추적할 수 있습니다.
- [임계값 감사 요약 패널](rank-api-key-cool다운-monitoring.md#4-telemetry-리포트--대시보드): 텔레메트리 `thresholdAudit`과 대시보드 카드/감사 로그 패널이 최근 임계값 변경 횟수, 마지막 조정 시각, Diff 요약을 한눈에 보여 줍니다.
- [임계값 감사 타임라인](rank-api-key-cool다운-monitoring.md#4-telemetry-리포트--대시보드): `thresholdAudit.timelines`가 일간/주간/월간 버킷을 함께 제공해 대시보드 타임라인 그래프가 모드를 전환하며 단기·장기 추세를 동시에 비교할 수 있습니다.
- [임계값 타임라인 내보내기](rank-api-key-cool다운-monitoring.md#4-telemetry-리포트--대시보드): 선택한 모드 데이터를 CSV·PNG로 내려받아 주간 보고·회고 문서에 바로 붙일 수 있습니다. 내보낸 직후 `/api/rank/upload-cooldown-timeline`이 팀 드라이브(또는 공유 디렉터리)에 파일을 업로드해 수동 공유 단계를 생략합니다.
- [업로드 성공 텔레메트리](rank-api-key-cool다운-monitoring.md#4-telemetry-리포트--대시보드): `timelineUploads` 요약과 업로드 감사 테이블을 연동해 최근 24시간·7일 성공 횟수, 마지막 성공 시각, 실패/건너뜀 내역을 대시보드 카드와 최근 업로드 패널에서 확인할 수 있습니다.
- [업로드 실패 임계값 경보](rank-api-key-cool다운-monitoring.md#4-telemetry-리포트--대시보드): 업로드 연속 실패(2/4회)·장기 미성공(6/12시간) 임계값을 정의해 `alerts.timelineUploads`와 대시보드 이슈 패널에 경고/위험 신호를 노출합니다.
- [API 키 회수 감사 스키마 초안](supabase-ddl-export.md#6-rank_api_key_audit-감사-로그-초안-2025-11-08-업데이트): `rank_api_key_audit` 테이블을 정의해 Edge Function 재시도, Slack 경보, 수동 회수 이력을 한 테이블에서 추적할 수 있도록 준비했습니다.
- [Edge Function 백오프 스케줄러](rank-api-key-cooldown-monitoring.md#edge-function-백오프-스케줄러-2025-11-08-업데이트): 감사 로그와 텔레메트리 지표를 바탕으로 `GET /api/rank/cooldown-retry-schedule`이 동적 백오프를 계산하도록 연결했습니다.
- [랜딩 청사진 보드](pages/index.js): 홈 히어로에서 단계별 진행률 보드를 노출해 매칭·세션·프롬프트·UI·운영 가드 상태를 2025-11-07 기준으로 요약합니다.【F:pages/index.js†L52-L92】【F:styles/Home.module.css†L43-L174】
- [StartClient 로그 보드 강화](components/rank/StartClient/LogsPanel.js): 전투 턴 로그가 요약 배지·프롬프트 프리뷰·변수 메타와 함께 카드 형태로 정돈되고, 모바일에서는 히스토리 패널이 세로 스택으로 재배치되며 데스크톱에서는 다단 그리드로 확장돼 운영·QA가 화면 크기에 맞춰 문맥을 확인할 수 있습니다. 섹션별 축약 토글·검색 필터에 더해 검색어 하이라이트와 액션·주역·태그 기반 다중 필터 칩을 붙여 긴 히스토리에서도 필요한 카드만 빠르게 추릴 수 있습니다.【F:components/rank/StartClient/LogsPanel.js†L1-L400】【F:components/rank/StartClient/LogsPanel.module.css†L1-L360】
- [브금 프리셋 & 재생목록 제어](components/rank/GameRoomView.js): 히어로 패널이 캐릭터별 재생목록 칩, EQ/리버브/컴프레서 토글, 프리셋 배지를 노출해 운영자가 상황별 사운드를 즉시 선택하거나 수동 조정 후 기본값으로 복원할 수 있고, 모바일에서도 동일 흐름이 유지되도록 버튼과 요약 영역을 세로 스택으로 재배치했습니다. 이번 라운드에선 선택한 트랙·프리셋·이펙트를 `rank_audio_preferences`에 저장하고 `rank_audio_events`로 변경 로그를 남겨, 재진입 시 그대로 복원되면서 운영자가 관리자 포털에서 추적할 수 있는 토대를 마련했습니다.【F:components/rank/GameRoomView.js†L780-L1160】【F:components/rank/GameRoomView.module.css†L927-L1340】【F:supabase.sql†L1-L120】
- [오디오 이벤트 모니터링 패널](components/admin/AudioEventMonitor.js): 관리자 포털에 오디오 변경 로그 패널을 추가해 운영자가 Owner/프로필/히어로/이벤트 유형·검색어 필터로 추려보고, 최근 24시간/7일/30일 스냅샷을 전환하거나 현재 뷰를 CSV로 내려받을 수 있습니다. 동일한 필터 세트를 `/api/admin/audio-events`에서 처리하며 `trend=weekly` 요청에선 Supabase RPC로 주간 집계를 돌려 그래디언트 바 차트·증감 배지를 렌더링합니다. 히어로·담당자 스택 차트는 상위 3/5/전체 토글과 스크롤 가능한 범례, 기타 그룹 안내를 제공해 로그가 많아져도 비교가 수월하며, 테스트 스위트가 CSV·필터 체인·RPC 호출까지 커버합니다.【F:components/admin/AudioEventMonitor.js†L1-L420】【F:styles/AdminPortal.module.css†L304-L360】【F:pages/api/admin/audio-events.js†L1-L244】【F:__tests__/api/admin/audio-events.test.js†L1-L256】
- [오디오 이벤트 Slack 다이제스트](scripts/notify-audio-event-trends.js): Supabase 서비스 키로 주간 집계를 가져와 Slack(Webhook)으로 다이제스트를 발송하고, CI 워크플로(`pr-ci.yml`, `blueprint-progress-freshness.yml`)가 주간 일정·PR 검증에 포함해 자동으로 실행합니다. 보조 헬퍼는 Jest 단위 테스트로 보장합니다.【F:scripts/notify-audio-event-trends.js†L1-L206】【F:__tests__/scripts/notify-audio-event-trends.test.js†L1-L66】【F:.github/workflows/pr-ci.yml†L1-L53】【F:.github/workflows/blueprint-progress-freshness.yml†L1-L53】

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->

## 6. 다음 액션 스냅샷
<!-- next-actions-status:start -->
> _2025-10-02 기준 자동 생성된 기한 알림._
> ✅ 모든 항목이 목표일 이내에 있습니다.
<!-- next-actions-status:end -->
| 순번 | 작업 | 담당 | 목표일 | 우선순위 | 예상 리소스 |
| --- | --- | --- | --- | --- | --- |
| 1 | QA가 듀오/캐주얼 재시작 시퀀스에서 큐 일관성 회귀가 없는지 통합 테스트(`pages/api/rank/play.ts`)를 재실행하도록 준비합니다. | QA (민서) | 2025-11-14 | P0 (회귀 차단) | QA 2일 (2명·3세션) |
| 2 | 즐겨찾기·Slack 구독 조건을 팀과 공유하고 Webhook 키별 다중 채널 알림·실행 로그 내보내기를 지원해 모니터링 규칙을 백업·확장합니다. | 프론트 (라라) | 2025-12-09 | P1 (오디오 튜닝) | 프론트 3일 (1명·UI/백엔드) |
| 3 | 제작기에서 세트를 저장하기 전 버전 불일치를 경고하는 Maker UX 개선안을 마련합니다. | Maker UX (도윤) | 2025-11-21 | P1 (제작기 안정화) | UX 2.5일 (리서치 포함) |
| 4 | API 키 쿨다운 만료 알림과 대체 키 추천 워크플로를 운영 대시보드에 연결합니다. | Ops (지후) | 2025-11-25 | P2 (운영 가드) | Ops 1.5일 (대시보드 연동) |
| 5 | Edge Function 재시도 스케줄러가 제안한 백오프·중단 사유를 운영 대시보드와 QA 회고에 노출해 경보 루프 전체에서 동일한 문맥을 공유합니다. | Ops (지후) | 2025-11-28 | P2 (재시도 루프) | Ops 2일 (데이터 동기화) |

담당·목표일은 7일 안팎으로 묶어 우선순위를 드러내고, 우선순위/리소스 열은 `P{n}` 등급과 예상 투입 공수를 함께 기록해 랜딩 히어로 카드에서도 D-Day 뱃지와 함께 우선순위·리소스 정보를 그대로 노출합니다. 자동 경고 블록은 마감이 지난 항목이나 3일 이내 임박한 항목을 추적해 개요 문서를 열었을 때도 상태를 바로 알 수 있도록 동일 스크립트에서 갱신되며, JSON 스냅샷에는 `priority.rank`와 `effort.personDays`가 포함돼 정렬 기준을 다양하게 활용할 수 있습니다.

## 7. 진행률 현황 (2025-11-08)
| 단계 | 상태 | 진행률 | 메모 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | QA 검토 중 | 80% | `/api/rank/play` 재시작 케이스를 테스트 플랜(DC-01~03)에 추가해 회귀 검증 범위를 확장했습니다. |
| 세션/전투 동기화 | 구현 진행 중 | 55% | `rank_turns` 가시성·요약 컬럼을 `run-turn`/`log-turn` API와 세션 히스토리 응답에 연결해 로그 파이프라인 일부가 작동하기 시작했습니다. |
| 프롬프트 변수 자동화 | 진행 중 | 60% | StartClient 경고 연동과 제작기 재저장 가이드 배포까지 끝났고, 남은 과제는 폴백 QA와 Maker 사전 경고뿐입니다. |
| UI·오디오 완성 | 완료 | 100% | 메인 룸 히어로 패널이 브금 자동 재생·컨트롤을 제공하고, StartClient 로그 보드는 섹션별 축약/펼치기 토글·검색 입력·하이라이트와 액션/주역/태그 다중 필터 칩을 갖춰 긴 히스토리에서도 필요한 카드만 빠르게 추립니다. 모바일에선 히스토리 패널이 세로로 재배치되고 데스크톱에선 다단 그리드로 확장돼 전투/AI/플레이어 히스토리를 화면 크기에 맞춰 보여주며, 브금 재생목록 전환·EQ/리버브/컴프레서 토글·리셋 칩이 연동된 상태에서 선택한 트랙과 이펙트는 사용자·운영자별로 저장돼 Supabase에서 복원됩니다. 관리자 포털 오디오 이벤트 패널은 Owner/히어로/이벤트 유형·검색어 필터와 기간 스위치에 더해 즐겨찾기·Slack 구독 조건을 저장/복원하는 폼, 임계치·주간 범위·항상 포함 토글, 스택 그래프 상위 N/스크롤 범례를 제공해 자주 보는 조합과 다이제스트 조건을 한곳에서 관리하고 Slack 메시지에도 동일한 하이라이트를 반영합니다. |
| 운영 가드 | 진행 중 | 85% | 감사 로그 기반 백오프 스케줄러, Slack ETA 안내, 임계값 변경 카드·감사 로그 패널, 일/주/월 토글·CSV/PNG 내보내기·팀 드라이브 자동 업로드를 갖춘 감사 타임라인 그래프에 더해 업로드 연속 실패/장기 미성공 임계값을 경보 체계와 대시보드 카드에 연동했습니다. |

**총 진행률(단계별 동일 가중치)**: 약 **76%**

홈 히어로에서 노출되는 진행률 보드와 다음 액션 카드가 이 표와 위 섹션을 그대로 참조할 수 있도록 데이터를 `data/rankBlueprintProgress.json`·`data/rankBlueprintNextActions.json`으로 분리해 사용하며, 최신화 뱃지가 2주 이상 경과 시 업데이트 필요 상태를 표시합니다. `npm run refresh:blueprint-progress` 스크립트를 실행하면 두 JSON과 자동 경고 블록이 재생성돼 문서/코드 동기화를 유지할 수 있고, `npm run check:blueprint-progress-freshness`(주 1회 GitHub Actions 스케줄과 PR/메인 푸시 CI에서 실행)로 14일 한계치를 넘길 경우 경고를 발생시켜 리마인더를 받습니다. `npm run check:blueprint-next-actions`는 마감이 지난 항목이 존재하면 CI를 실패시키고, JSON에는 담당자 키·D-Day·연체 여부가 함께 기록돼 랜딩 카드와 문서가 동일한 기준으로 경고를 노출합니다. 두 워크플로 모두에서 `npm test -- --runInBand`와 `CI=1 npm run build`를 함께 실행하고 `.next/cache`를 복원하는 빌드 캐시, `jest-junit` 기반 테스트 리포트 업로드, Step Summary용 메트릭 게시를 포함해 에러 리포트 관리자 API 회귀뿐 아니라 실행 시간 추적과 병목 파악을 동시에 지원합니다.【F:data/rankBlueprintProgress.json†L1-L35】【F:data/rankBlueprintNextActions.json†L1-L33】【F:pages/index.js†L8-L200】【F:styles/Home.module.css†L1-L266】【F:scripts/refresh-rank-blueprint-progress.js†L1-L339】【F:scripts/check-rank-blueprint-progress-freshness.js†L1-L74】【F:scripts/check-rank-blueprint-next-actions.js†L1-L87】【F:.github/workflows/blueprint-progress-freshness.yml†L1-L47】【F:.github/workflows/pr-ci.yml†L1-L42】

---
느낀 점: 청사진 문서가 방대해 핵심 줄기를 요약해두니 신규 인원과 동기화할 때 맥락 잡기가 한결 수월해졌습니다.
추가로 필요한 점: Maker에서 저장 전 버전 불일치를 잡아주는 경고 UI와 QA 자동화를 붙이면 문서와 실제 대응 속도를 더 끌어올릴 수 있을 것 같습니다.
진행사항: 실행 플랜과 진행 리포트를 참고해 핵심 목표, 리스크, 다음 액션을 묶은 청사진 요약 문서를 새로 작성했습니다.
