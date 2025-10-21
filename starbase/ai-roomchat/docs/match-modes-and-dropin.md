# Match Modes, Realtime vs Non-Realtime, and Drop-in

본 문서는 매칭/게임 모드를 정리하고, 비실시간/실시간과 난입의 의도를 코드와 일치시키기 위한 기준을 담습니다.

## 핵심 개념
- 비실시간(Offline/Non-Realtime)
  - 플레이어 1명만 실제 유저이고, 나머지 슬롯은 역할/점수대가 맞는 "대역(stand-in)"이 채웁니다.
  - 대역은 플랫폼이 가진 참가자 풀(Participant Pool)에서 점수/역할 조건을 만족하는 캐릭터를 샘플링해 매칭합니다.
  - 턴은 비동기로 진행되며, 유저의 API(해당 캐릭터의 프롬프트/행동)를 사용해 게임을 굴립니다.
  - 대역이 승리/패배하면, 대역으로 호출된 캐릭터의 점수도 증감합니다.
- 실시간(Realtme)
  - 모든 슬롯이 실제 유저로 채워집니다. 각자는 자신의 API를 사용해 턴을 수행합니다.
  - 턴마다 시간 제한이 존재합니다(게임 룰로 설정). 실시간 방(`rank_rooms`) + 슬롯(`rank_room_slots`) 구조와 동기화합니다.

## 난입(Drop-in)
- 공통: 승리했다고 세션이 즉시 끝나지 않을 수 있으며, 세션 종료 시
  - 누적 승리 횟수 × 승리 점수(상한 적용) − 패배로 인한 감소 점수 = 최종 점수 산출
- 비실시간 난입
  - 역할군이 패배해 빈 자리가 생기면 다음 턴에 해당 역할군/점수대에 맞춘 다른 대역이 자동으로 난입(stand-in refill)
  - 구현: 오프라인 드롭인 경로에서 표준 매처(runMatching)를 사용해 다음 턴에 채워질 대역을 결정
- 실시간 난입
  - 역할군이 패배해 빈 자리가 생기면, 매칭 대기열의 다른 참여자가 점수/역할 조건에 맞추어 해당 역할군을 즉시 다 채울 수 있는 경우 게임에 난입
  - 구현: `findRealtimeDropInTarget`이 열린 슬롯과 점수 평균을 비교해 후보를 선발하고 슬롯을 즉시 선점(claim)

## 코드 합의(pipeline)
- 토글 추출: `extractMatchingToggles(gameRow, rules)`
  - realtimeEnabled: 실시간 여부
  - dropInEnabled: 난입 허용 여부
- 리소스 로드: `loadMatchingResources({ supabase, gameId, mode, realtimeEnabled, brawlEnabled })`
- 실시간 난입 경로(허용 시): `findRealtimeDropInTarget`
  - 성공 시 즉시 슬롯 업데이트 후 `markAssignmentsMatched`
- 비실시간 경로: `buildCandidateSample` → `runMatching`
  - env 가드된 안전 매처(정확 슬롯 충족 시 점수 윈도우 무시) 사용 가능

## 점수 정책(요약)
- 기본 점수: 참가자의 score/rating을 사용 (없으면 1000 기본값)
- 윈도우: 실시간 드롭인 기본 200, 비실시간 기본 300 (룰에서 오버라이드 가능)
- 비실시간 후보 제한: per-role, total limit로 스탠딘 샘플 크기 제한

## TODO
- 턴 제한/타이머: 실시간 모드에서 프론트/백엔드 타임아웃 경보 및 스킵 처리
- 세션 종료/점수 계산 공식: 위 정의에 맞춘 집계 RPC 또는 서버 함수화
- 대역 점수 증감: stand-in에게도 동일한 점수 증감 적용되도록 트랜잭션 설계
