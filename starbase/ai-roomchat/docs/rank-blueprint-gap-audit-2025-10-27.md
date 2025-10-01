# Rank Blueprint Gap Audit — 2025-10-27

## Overview
이번 점검은 랭크 게임 청사진에 명시된 핵심 단계(슬롯 수명주기, 매칭 자동화, 세션·히스토리, 점수/상태 동기화, 운영 가드)를 다시 훑어보면서
이미 구현된 범위와 아직 남은 격차를 표준화된 형태로 정리하기 위한 목적이다.

- **점검 기준**: `rank-blueprint-execution-plan.md`와 `rank-game-logic-plan.md`에 정의된 단계별 목표.
- **참고 데이터**: 현재 배포 브랜치 기준 코드(`pages/api/rank/*.js`, `components/rank/*`, `hooks/useGameRoom.js`).

## Status Snapshot
| 영역 | 현재 상태 | 근거 |
| --- | --- | --- |
| 슬롯 점유/해제 | ✅ 구현 | `/api/rank/join-game`이 빈 슬롯을 잠그고 기존 소유 슬롯을 해제한 뒤 `rank_participants`를 upsert한다.【F:starbase/ai-roomchat/pages/api/rank/join-game.js†L1-L162】 `/api/rank/leave-game`은 슬롯과 참가자 상태를 동시에 정리한다.【F:starbase/ai-roomchat/pages/api/rank/leave-game.js†L1-L92】 |
| 자동 대기열 진입 | ✅ 구현 | `AutoMatchProgress`가 뷰어·역할·히어로 준비를 확인한 뒤 자동으로 큐에 합류하고, 확인 단계/재시도/타임아웃을 관리한다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L620】 솔로/듀오/캐주얼 페이지는 해당 컴포넌트를 그대로 사용한다.【F:starbase/ai-roomchat/pages/rank/[id]/solo.js†L1-L42】【F:starbase/ai-roomchat/pages/rank/[id]/duo/queue.js†L1-L41】 |
| 세션 생성/턴 로그 | ✅ 구현 | `/api/rank/start-session`이 인증된 요청으로 `rank_sessions`를 활성화하고 초기 턴 로그를 남긴다.【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L158】 `/api/rank/run-turn`과 `/api/rank/log-turn`이 각 턴을 `rank_turns`에 저장한다.【F:starbase/ai-roomchat/pages/api/rank/run-turn.js†L1-L176】【F:starbase/ai-roomchat/pages/api/rank/log-turn.js†L1-L146】 |
| 전투 기록/점수 동기화 | ⚠️ 부분 구현 | `recordBattle`이 공격자 점수·상태 업데이트와 턴 배열 저장까지 처리하지만, 다중 방어자 및 난입 참가자 점수는 반영하지 않는다.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L189】 `/api/rank/finalize-session` 역시 승/패 요약을 기록하는 수준이다.【F:starbase/ai-roomchat/pages/api/rank/finalize-session.js†L1-L123】 |
| 공유 히스토리/가시성 | ⚠️ 부분 구현 | `useGameRoom`은 개인 세션 로그만 노출하고 있으며, 공용 히스토리·인비저블 필터는 아직 문서 수준이다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L318-L413】【F:starbase/ai-roomchat/docs/rank-turn-history-spec.md†L1-L194】 |
| 운영 가드 | ⏳ 미착수 | API 키 고갈 감지, 큐 모니터링, `engaged` 해제 자동화는 문서 메모만 존재한다.【F:starbase/ai-roomchat/docs/rank-game-logic-plan.md†L213-L236】【F:starbase/ai-roomchat/docs/rank-blueprint-execution-plan.md†L147-L186】 |

## Newly Identified Gaps
1. **다중 방어자 기록 불일치**: `recordBattle`은 `defenderOwners` 반환을 준비하지만 실제로 방어자 점수/상태를 갱신하지 않아
   듀오·캐주얼 난입 시 결과가 반영되지 않는다.【F:starbase/ai-roomchat/lib/rank/persist.js†L118-L189】
2. **공용 히스토리 미연동**: 문서에는 인비저블 라인, 60초 파악 시간, AI 히스토리 공유 요구가 정리돼 있으나 UI/훅 연결은 시작되지 않았다.【F:starbase/ai-roomchat/docs/rank-turn-history-spec.md†L12-L194】
3. **운영 경보 파이프라인 부재**: API 키 고갈 및 대체 호출 시나리오가 설계 문서에만 있고, Supabase 테이블/함수는 만들어지지 않았다.【F:starbase/ai-roomchat/docs/rank-game-logic-plan.md†L213-L236】

## Recommended Next Steps
- **Score Sync Sprint**: `recordBattle`과 `finalize-session`을 확장해 방어자/난입 참가자 점수를 함께 갱신하고, `rank_participants.status`를 `won`/`lost`/`retired`/`engaged` 상태 정의에 맞게 정리한다.
- **Shared History Hook**: `useGameRoom`과 `SharedChatDock`을 연결하는 `useSharedHistory` 훅을 도입해 개인/공용 로그를 동시에 다룰 수 있는 구조를 마련한다.
- **Ops Guard Prototype**: API 키 사용량을 기록할 `rank_api_key_audit`(가칭) 테이블과 5시간 쿨다운 로직을 Edge Function 또는 사내 스케줄러로 구현하는 계획을 착수한다.

---
느낀 점: 청사진을 다시 훑어보니 이미 구현한 슬롯·세션 자동화가 단단히 자리 잡았다는 확신이 생겼고, 남은 빈칸도 명확하게 드러났습니다.
추가로 필요한 점: 점수/상태 동기화와 공용 히스토리 연동을 담당할 백엔드 리소스 배정이 선행되어야 다음 단계 속도를 낼 수 있을 것 같습니다.
진행사항: 슬롯/세션 구현 범위를 확인하고, 점수·히스토리·운영 항목의 격차를 문서화해 후속 스프린트 준비가 가능하도록 했습니다.
