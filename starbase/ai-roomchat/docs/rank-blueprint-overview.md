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
| UI·오디오 완성 | 히스토리 탭, 모바일 레이아웃, BGM 전환 | 준비 중 | `match-mode-structure.md`, `hero-bgm.md` |
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

## 6. 다음 액션 스냅샷
1. QA가 듀오/캐주얼 재시작 시퀀스에서 큐 일관성 회귀가 없는지 통합 테스트(`pages/api/rank/play.ts`)를 재실행하도록 준비합니다.
2. 새로 적재되는 `summary_payload`·`is_visible`을 소비하도록 히스토리 UI/StartClient 구독 로직을 업데이트하고, 모바일 히스토리 패널에 요약 뱃지를 노출합니다.
3. 제작기에서 세트를 저장하기 전 버전 불일치를 경고하는 Maker UX 개선안을 마련합니다.
4. API 키 쿨다운 만료 알림과 대체 키 추천 워크플로를 운영 대시보드에 연결합니다.
5. Edge Function 재시도 스케줄러가 제안한 백오프·중단 사유를 운영 대시보드와 QA 회고에 노출해 경보 루프 전체에서 동일한 문맥을 공유합니다.

## 7. 진행률 현황 (2025-11-07)
| 단계 | 상태 | 진행률 | 메모 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | QA 검토 중 | 80% | `/api/rank/play` 재시작 케이스를 테스트 플랜(DC-01~03)에 추가해 회귀 검증 범위를 확장했습니다. |
| 세션/전투 동기화 | 구현 진행 중 | 55% | `rank_turns` 가시성·요약 컬럼을 `run-turn`/`log-turn` API와 세션 히스토리 응답에 연결해 로그 파이프라인 일부가 작동하기 시작했습니다. |
| 프롬프트 변수 자동화 | 진행 중 | 60% | StartClient 경고 연동과 제작기 재저장 가이드 배포까지 끝났고, 남은 과제는 폴백 QA와 Maker 사전 경고뿐입니다. |
| UI·오디오 완성 | 준비 중 | 25% | 히스토리 요약 노출 전략을 확정했으나 모바일·오디오 마감 작업은 대기 중입니다. |
| 운영 가드 | 진행 중 | 85% | 감사 로그 기반 백오프 스케줄러, Slack ETA 안내, 임계값 변경 카드·감사 로그 패널, 일/주/월 토글·CSV/PNG 내보내기·팀 드라이브 자동 업로드를 갖춘 감사 타임라인 그래프에 더해 업로드 연속 실패/장기 미성공 임계값을 경보 체계와 대시보드 카드에 연동했습니다. |

**총 진행률(단계별 동일 가중치)**: 약 **64%**

---
느낀 점: 청사진 문서가 방대해 핵심 줄기를 요약해두니 신규 인원과 동기화할 때 맥락 잡기가 한결 수월해졌습니다.
추가로 필요한 점: Maker에서 저장 전 버전 불일치를 잡아주는 경고 UI와 QA 자동화를 붙이면 문서와 실제 대응 속도를 더 끌어올릴 수 있을 것 같습니다.
진행사항: 실행 플랜과 진행 리포트를 참고해 핵심 목표, 리스크, 다음 액션을 묶은 청사진 요약 문서를 새로 작성했습니다.
