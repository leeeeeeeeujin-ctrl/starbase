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
| 운영 모니터링·콘텐츠 확장 | 관리자 모니터링 포털 내 콘텐츠 허브, 공지/튜토리얼 에디터, 배포 이력 테이블 | 기획 진행 중 | 초안 진행 중 |

## 3. 현재 결정 사항
- 난입 슬롯 충원 후에도 동일 세션 수명주기를 유지한다.
- 턴 로그는 `rank_turns` 단일 테이블에서 인비저블 라인까지 관리한다.
- 프롬프트 변수는 제작기 메타데이터(JSON)에서 직접 파싱해 슬롯별 상태를 동기화한다.

## 4. 리스크 & 대응 전략
- **세션 상태 불일치**: `AutoMatchProgress` ↔ `useGameRoom` 동기화 테스트를 E2E로 보강.
- **프롬프트 변수 누락**: 제작기 노드 내보내기 스키마 변경 시 CLI 검증을 의무화.
- **운영 부하**: API 키 교대/알림 자동화를 Edge Function으로 이관.

## 5. 최근 진행 스냅샷 (2025-11-16)
- 비실시간 매칭을 위해 `buildCandidateSample`에 점수 윈도우·역할별/총 샘플 제한을 도입해 참가자 풀을 안정적으로 보강하도록 했습니다.【F:starbase/ai-roomchat/lib/rank/matchingPipeline.js†L332-L489】
- `/api/rank/match`가 큐/참가자 표본 메타데이터를 함께 반환하고, `MatchQueueClient`가 매칭 결과에 큐 표본 요약을 노출하도록 API·UI를 보완했습니다.【F:starbase/ai-roomchat/pages/api/rank/match.js†L174-L216】【F:starbase/ai-roomchat/components/rank/MatchQueueClient.js†L200-L690】
- Supabase `rank_participants`에 역할·상태 인덱스를 추가하고, 매칭 전용 스키마 핸드북 문서를 별도 정리해 복구·이관 절차를 단순화했습니다.【F:starbase/ai-roomchat/supabase.sql†L858-L893】【F:docs/matchmaking-supabase-handbook.md†L1-L40】

<!-- blueprint-next-actions:start -->
## 6. 다음 액션 스냅샷

<!-- next-actions-status:start -->
> _2025-11-17 기준 자동 생성된 기한 알림._
> 📅 #1 (프론트 (라라)) 마감이 2일 남았습니다.
> 📅 #4 (Matchmaking (류·라라)) 마감이 7일 남았습니다.
<!-- next-actions-status:end -->

| 순번 | 작업 | 담당 | 목표일 | 우선순위 | 예상 리소스 |
| --- | --- | --- | --- | --- | --- |
| 1 | 관리자 모니터링 페이지에 랜딩 히어로·공지 WYSIWYG 블록을 붙여 코드 배포 없이 콘텐츠를 교체할 수 있도록 UI/스토리지 스키마를 확정합니다. | 프론트 (라라) | 2025-11-19 | P0 (운영 커뮤니케이션) | 프론트 3일 (UI/스토리지) |
| 2 | 페이지별 튜토리얼·체크리스트·비상 공지를 작성/승인/게시하는 워크플로와 검수 알림을 설계합니다. | Ops (지후) | 2025-11-22 | P1 (운영 가이드) | Ops 2일 (프로세스 설계) |
| 3 | 콘텐츠 배포 이력·승인 로그를 감사 페이지와 Slack에 동기화하는 히스토리 테이블과 알림 파이프라인을 구축합니다. | 백엔드 (세민) | 2025-11-27 | P1 (감사 추적) | 백엔드 3일 (테이블/알림) |
| 4 | 드롭인/비실시간 매칭 소크 테스트를 진행하고, 매칭 로그 요약 API 요구사항을 정리합니다. | Matchmaking (류·라라) | 2025-11-24 | P1 (매칭 안정화) | 프론트·백엔드 3일 (UX/로직 QA) |

<!-- blueprint-next-actions:end -->

<!-- blueprint-progress:start -->
## 7. 진행률 현황 (2025-11-17 기준)

| 단계 | 상태 | 진행률 | 메모 |
| --- | --- | --- | --- |
| 매칭 트리거 통일 | 완료 | 100% | 듀오/캐주얼 재시작 회귀(DC-01~03) QA를 마치고 실서비스 스모크 테스트와 큐 일관성 대시보드 경보 점검까지 통과해 `/api/rank/play` 재시작 흐름이 운영 기준을 충족했습니다. |
| 세션/전투 동기화 | 완료 | 100% | `rank_turns` 요약 메타가 라이브 히스토리·리포트에 모두 반영되고, 인비저블 라인 필터 QA와 히스토리 API 폴링 전략이 확정돼 전투 로그 동기화가 완결되었습니다. |
| 프롬프트 변수 자동화 | 완료 | 100% | Maker 폴백 경고 UX와 자동 버전 동기화 루프를 연결해 변수 누락 경보 없이 제작기가 작동하며, QA 체크리스트까지 통과해 프롬프트 자동화가 안정화되었습니다. |
| UI·오디오 완성 | 완료 | 100% | 히어로 패널·로그 보드·오디오 모니터링이 데스크톱·모바일 모두에서 완성형 레이아웃과 제어를 제공해 사용자·운영 경험이 일관되게 유지됩니다. |
| 운영 가드 | 완료 | 100% | Edge Function 감사 로그 검증과 자동 키 회전/만료 알림, Slack 에스컬레이션을 대시보드에 연동해 운영 가드 루프가 닫혔습니다. |
| 운영 모니터링·콘텐츠 확장 | 기획 진행 중 | 15% | 관리자 모니터링 포털에서 랜딩 히어로·공지·페이지별 튜토리얼을 직접 편집하고 배포 이력을 추적할 수 있는 콘텐츠 허브와 리뷰 플로우를 설계 중입니다. |
| 실시간·난입 매칭 계층화 | 구현 진행 중 | 82% | 실시간 난입 파이프라인 위에 비실시간 경고·재시도 UX와 QA 체크리스트를 얹어 표본 메타 기반 안내를 완성했습니다. 남은 소크 테스트와 로그 연동만 정리하면 됩니다. |

**총 진행률(단계별 동일 가중치)**: 약 **91%**

<!-- blueprint-progress:end -->

<!-- blueprint-remaining:start -->
### 8. 남은 청사진 핵심 작업 (2025-11-17 기준)
| 단계 | 남은 핵심 작업 | 현재 진행률 |
| --- | --- | --- |
| 운영 모니터링·콘텐츠 확장 | 관리자 모니터링 페이지에 랜딩 히어로·공지 블록을 편집·예약할 수 있는 콘텐츠 모듈을 붙이고, 편집 이력을 감사 로그에 저장하는 데이터 모델을 확정합니다. | 15% |
| 운영 모니터링·콘텐츠 확장 | 페이지별 튜토리얼/체크리스트·비상 알림을 작성·게시할 수 있도록 에디터 UX와 검수 워크플로(임시 저장, 승인, 버전 롤백)를 설계합니다. | 15% |
| 실시간·난입 매칭 계층화 | 드롭인/비실시간 소크 테스트와 매칭 로그 요약 API 요구사항을 확정합니다. | 82% |

<!-- blueprint-remaining:end -->

랜딩 히어로는 이 표를 기반으로 전체 진행도 카드(약 88%, 남은 단계 2개)를 노출해 남은 작업을 즉시 확인할 수 있습니다.【F:data/rankBlueprintProgress.json†L1-L37】【F:pages/index.js†L8-L210】【F:styles/Home.module.css†L1-L360】

홈 히어로에서 노출되는 진행률 보드와 다음 액션 카드가 이 데이터와 동기화되며, 최신화 뱃지가 2주 이상 경과 시 업데이트 필요 상태를 표시합니다. `npm run refresh:blueprint-progress` 스크립트를 실행하면 두 JSON과 자동 경고 블록이 재생성돼 문서/코드 동기화를 유지하고, `npm run check:blueprint-progress-freshness`(주 1회 GitHub Actions 스케줄과 PR/메인 푸시 CI에서 실행)와 `npm run check:blueprint-next-actions`가 스냅샷이 오래되거나 마감이 지난 항목이 있을 때 알림을 제공합니다.【F:data/rankBlueprintProgress.json†L1-L37】【F:data/rankBlueprintNextActions.json†L1-L5】【F:scripts/refresh-rank-blueprint-progress.js†L1-L329】【F:scripts/check-rank-blueprint-progress-freshness.js†L1-L62】【F:scripts/check-rank-blueprint-next-actions.js†L1-L72】

---
느낀 점: 비실시간 표본까지 한 번에 계산해 주니 드롭인과 표준 매칭이 동일한 언어로 설명돼 QA가 훨씬 수월해질 것 같습니다.
추가로 필요한 점: 새로 노출된 샘플 메타를 활용해 재시도/경고 UX를 빠르게 검토하고, 시나리오 테스트 결과를 체크리스트로 남겨야 합니다.
진행사항: 비실시간 샘플링·표본 메타 리포트·참가자 인덱스·매칭 스키마 문서를 추가해 매칭 청사진 진행률과 문서를 모두 갱신했습니다.
