# 랭크 게임 청사진 요약

청사진 실행 문서와 진행 리포트를 빠르게 훑고 싶을 때 참고할 수 있는 개요입니다. 전체 플랜은 `rank-blueprint-execution-plan.md`, 일일 업데이트는 `rank-blueprint-progress-*.md`에서 확인할 수 있습니다.

## 1. 비전 & 핵심 지표
- **목표 경험**: 자동 매칭, 프롬프트 기반 전투, 히스토리 공유를 결합한 경쟁 모드.
- **성공 지표**
  - 매칭 성공률 95% 이상(큐 진입 → 세션 생성까지).
  - 전투 로그 누락률 1% 미만(`rank_turns` 기준).
  - 운영 알림 대응 시간 15분 이내(API 키 고갈, 큐 정지 등).

## 2. 단계별 로드맵 하이라이트
| 단계 | 핵심 산출물 | 상태 | 참고 문서 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | `/api/rank/play`-`/start-session` 재시작 일원화, 큐 일관성 대시보드 경보 | 완료 | `rank-blueprint-execution-plan.md` 7.1, `matchmaking_auto_flow_notes.md` |
| 세션/전투 동기화 | `recordBattle` 다중 결과, `rank_turns` 요약 메타 소비 경로 | 완료 | `rank-game-logic-plan.md`, `rank-turn-history-spec.md` |
| 프롬프트 변수 자동화 | 제작기 변수 동기화, 폴백 경고 UX | 완료 | `lib/rank/prompt.js`, `rank-prompt-set-versioning-guide.md` |
| UI·오디오 완성 | 히스토리 탭, 모바일 레이아웃, BGM 제어 | 완료 | `match-mode-structure.md`, `hero-bgm.md`, `components/rank/StartClient/LogsPanel.js` |
| 운영 가드 | API 키 교대, 자동 키 회전/만료 알림, 감사 로그 | 완료 | `rank-api-key-cooldown-monitoring.md`, `slot-sweeper-schedule.md` |

## 3. 현재 결정 사항
- 난입 슬롯 충원 후에도 동일 세션 수명주기를 유지한다.
- 턴 로그는 `rank_turns` 단일 테이블에서 인비저블 라인까지 관리한다.
- 프롬프트 변수는 제작기 메타데이터(JSON)에서 직접 파싱해 슬롯별 상태를 동기화한다.

## 4. 리스크 & 대응 전략
- **세션 상태 불일치**: `AutoMatchProgress` ↔ `useGameRoom` 동기화 테스트를 E2E로 보강.
- **프롬프트 변수 누락**: 제작기 노드 내보내기 스키마 변경 시 CLI 검증을 의무화.
- **운영 부하**: API 키 교대/알림 자동화를 Edge Function으로 이관.

## 5. 최근 진행 스냅샷 (2025-11-12)
- [매칭 재시작 QA 종료](rank-blueprint-progress-2025-11-12.md): 듀오/캐주얼 재시작 회귀(DC-01~03) 통합 테스트와 실서비스 스모크를 모두 통과해 매칭 트리거 통일 단계를 닫았습니다.
- [세션 히스토리 완전 동기화](rank-blueprint-progress-2025-11-12.md#session-sync): `rank_turns` 요약 메타를 소비하는 UI·리포트가 모두 연결되어 전투 로그와 세션 히스토리가 동일한 요약을 제공합니다.
- [프롬프트 변수 자동화 QA 완료](rank-blueprint-progress-2025-11-11.md): Maker 폴백 경고 UX, 자동 버전 동기화 루프, QA 체크리스트가 마감되어 변수 누락 경보가 제거되었습니다.
- [운영 가드 루프 연동](rank-blueprint-progress-2025-11-10.md): Edge Function 감사 로그 검증과 자동 키 회전/만료 알림이 Slack·대시보드와 연결되어 운영 대응 루프가 자동화되었습니다.

<!-- blueprint-next-actions:start -->
## 6. 다음 액션 스냅샷

> _2025-11-12 기준 자동 생성된 기한 알림._
> 🎉 모든 후속 작업을 완료했습니다.

| 순번 | 작업 | 담당 | 목표일 | 우선순위 | 예상 리소스 |
| --- | --- | --- | --- | --- | --- |
| – | 추가 액션 없음 | – | – | – | – |

<!-- blueprint-next-actions:end -->

<!-- blueprint-progress:start -->
## 7. 진행률 현황 (2025-11-12 기준)

| 단계 | 상태 | 진행률 | 메모 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | 완료 | 100% | 듀오/캐주얼 재시작 회귀 QA와 실서비스 스모크 테스트, 큐 일관성 대시보드 점검을 모두 통과했습니다. |
| 세션/전투 동기화 | 완료 | 100% | `rank_turns` 요약 메타가 라이브 히스토리·리포트·인비저블 라인 QA를 모두 충족해 동기화가 마무리되었습니다. |
| 프롬프트 변수 자동화 | 완료 | 100% | Maker 폴백 경고 UX, 자동 버전 동기화, QA 체크리스트 통과로 변수 자동화가 안정화되었습니다. |
| UI·오디오 완성 | 완료 | 100% | 히어로 패널·로그 보드·오디오 모니터링이 데스크톱·모바일 모두에서 완성된 제어 흐름을 제공합니다. |
| 운영 가드 | 완료 | 100% | Edge Function 감사 로그 검증과 자동 키 회전/만료 알림, Slack 에스컬레이션 연동으로 운영 루프가 닫혔습니다. |

**총 진행률(단계별 동일 가중치)**: **100%**

<!-- blueprint-progress:end -->

<!-- blueprint-remaining:start -->
### 8. 남은 청사진 핵심 작업 (2025-11-12 기준)

| 단계 | 남은 핵심 작업 | 현재 진행률 |
| --- | --- | --- |
| 전체 | 남은 핵심 작업 없음 | 100% |

<!-- blueprint-remaining:end -->

랜딩 히어로는 이 표를 기반으로 전체 진행도 카드(100%, 5개 단계 모두 완료)를 노출해 완료 상태를 즉시 확인할 수 있습니다.【F:data/rankBlueprintProgress.json†L1-L37】【F:pages/index.js†L8-L210】【F:styles/Home.module.css†L1-L360】

홈 히어로에서 노출되는 진행률 보드와 다음 액션 카드가 이 데이터와 동기화되며, 최신화 뱃지가 2주 이상 경과 시 업데이트 필요 상태를 표시합니다. `npm run refresh:blueprint-progress` 스크립트를 실행하면 두 JSON과 자동 경고 블록이 재생성돼 문서/코드 동기화를 유지하고, `npm run check:blueprint-progress-freshness`(주 1회 GitHub Actions 스케줄과 PR/메인 푸시 CI에서 실행)와 `npm run check:blueprint-next-actions`가 스냅샷이 오래되거나 마감이 지난 항목이 있을 때 알림을 제공합니다.【F:data/rankBlueprintProgress.json†L1-L37】【F:data/rankBlueprintNextActions.json†L1-L5】【F:scripts/refresh-rank-blueprint-progress.js†L1-L329】【F:scripts/check-rank-blueprint-progress-freshness.js†L1-L62】【F:scripts/check-rank-blueprint-next-actions.js†L1-L72】

---
느낀 점: 데이터·UI·문서까지 한 번에 닫히니 청사진 완성도를 팀 전체와 공유하기가 훨씬 수월해졌습니다.
추가로 필요한 점: 후속 유지보수를 위해 주간 점검 체크리스트와 회고 항목을 자동 생성하는 루틴이 있으면 좋겠습니다.
진행사항: 청사진 진행·다음 액션 데이터를 최신 상태(100%)로 갱신하고, 랜딩·문서가 완료 상황을 드러내도록 정리했습니다.
