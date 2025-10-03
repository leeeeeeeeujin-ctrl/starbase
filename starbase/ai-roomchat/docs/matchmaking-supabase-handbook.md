# Matchmaking Supabase Handbook

이 문서는 랭크 게임 매칭 파이프라인이 의존하는 Supabase 테이블과 인덱스를 한눈에 볼 수 있도록 정리한 참고용 핸드북입니다. 신규 프로젝트에 스키마를 배포하거나 손실된 테이블을 복원할 때 아래 표를 순서대로 확인하세요.

## 1. 게임 카탈로그 & 역할 정의
- **`public.rank_games`** – 매칭을 위한 기본 게임 행을 저장합니다. 소유자 FK, 룰 JSON, 실시간 플래그, 좋아요/플레이 카운터, 생성·갱신 시각을 포함하고 소유자만 쓰기 가능한 RLS가 적용됩니다.【F:starbase/ai-roomchat/supabase.sql†L730-L748】
- **`public.rank_game_roles`** – 역할 이름, 슬롯 수, 활성화 여부, 점수 증감 범위를 정의하며 게임 소유자만 수정할 수 있도록 단일 `for all` 정책을 둡니다.【F:starbase/ai-roomchat/supabase.sql†L750-L775】
- **`public.rank_game_slots`** – 게임별 기본 슬롯 격자를 제공해 로비가 최소 정원을 판단하고 슬롯별 기본 히어로를 표시할 수 있습니다. `(game_id, slot_index)` 유니크 제약으로 순서를 고정합니다.【F:starbase/ai-roomchat/supabase.sql†L829-L856】

## 2. 대기열 & 참가자 저장소
- **`public.rank_participants`** – 플레이어의 영구 등록 정보를 보관합니다. 영웅/역할, 점수·레이팅, 전적, 상태 플래그, 타임스탬프를 포함하며 `(game_id, owner_id)` 유니크 제약과 소유자 기반 RLS가 적용됩니다. 난입·보강 시 최신 후보를 빠르게 찾기 위해 `(game_id, role, status, updated_at desc)` 인덱스를 추가했습니다.【F:starbase/ai-roomchat/supabase.sql†L858-L893】
- **`public.rank_match_queue`** – 실시간 대기열 엔트리를 관리합니다. 게임·모드·역할·점수·파티 키·상태·참여 시각을 저장하고 큐 조회/소유자 조회용 인덱스를 제공합니다.【F:starbase/ai-roomchat/supabase.sql†L958-L977】

## 3. 라이브 방 & 슬롯
- **`public.rank_rooms`** – 열린 방의 코드, 모드, 상태, 슬롯/준비 카운트, 호스트 하트비트 등을 기록하고 호스트 또는 착석한 참가자만 업데이트할 수 있도록 정책을 구성했습니다.【F:starbase/ai-roomchat/supabase.sql†L927-L1004】
- **`public.rank_room_slots`** – 방별 슬롯 점유 현황을 추적합니다. 슬롯 인덱스, 역할, 참가자/히어로, 준비 상태, 입장 시각을 저장하며 `(room_id, role, occupant_owner_id)` 인덱스로 빈 자리를 빠르게 찾을 수 있습니다.【F:starbase/ai-roomchat/supabase.sql†L942-L956】【F:starbase/ai-roomchat/supabase.sql†L1006-L1040】

## 4. 세션 런타임 & 턴 로그
- **`public.rank_sessions`** – 매칭 성공 후 생성되는 세션 엔벨로프를 보관합니다. 게임·소유자 FK, 상태, 현재 턴, 생성/갱신 시각, 그리고 드롭인 점수 필터에 사용하는 `rating_hint` 열과 진행 중 세션 탐색 인덱스를 포함합니다.【F:starbase/ai-roomchat/supabase.sql†L1072-L1087】
- **`public.rank_turns`** – 전투 중 기록되는 턴 텍스트를 순서대로 적재합니다. 세션 FK, 턴 인덱스, 역할, 공개 여부, 본문, 생성 시각을 담고 RLS로 인증된 사용자만 삽입할 수 있습니다.【F:starbase/ai-roomchat/supabase.sql†L1099-L1115】

## 5. 로그 & 진단
- **`public.rank_matchmaking_logs`** – 드롭인/비실시간 파이프라인 단계별 이벤트를 적재합니다. 매치 코드, 단계, 상태, 점수 윈도우, 메타데이터를 JSON으로 저장하고, 생성 시각/단계 인덱스로 관리자 API가 빠르게 요약을 계산할 수 있습니다.【F:starbase/ai-roomchat/supabase.sql†L1014-L1039】
- 서비스 롤 전용 RLS 정책(`rank_matchmaking_logs_service_insert`, `rank_matchmaking_logs_service_select`)이 포함돼 있으니 Supabase 배포 후 정책이 활성화됐는지 확인하고, 관리자 포털의 <em>매칭 로그 요약</em> 카드에서 연결 상태를 점검하세요.

## 6. 복구 체크리스트
1. `docs/supabase-rank-schema.sql`을 Supabase SQL Editor에 붙여 넣어 위 테이블과 정책·인덱스를 한 번에 생성합니다.【F:docs/supabase-rank-schema.sql†L1-L1440】
2. 스토리지나 보조 스키마가 필요하면 `supabase_chat.sql`, `supabase_social.sql`을 추가로 실행합니다.
3. 최소 하나의 게임/역할/슬롯 데이터를 시드해 로비가 정원을 계산할 수 있도록 합니다.
4. 매칭 QA 전에 `rank_match_queue`, `rank_participants`에 테스트 데이터를 넣고, 방을 생성해 `rank_room_slots`가 즉시 업데이트되는지 확인하세요.

---
느낀 점: 로그 테이블까지 포함하니 로비→큐→세션→진단으로 이어지는 데이터 경로가 더 명확해졌습니다.
추가로 필요한 점: 실서비스에 배포할 때는 `rank_matchmaking_logs` 테이블이 주기적으로 정리되도록 보관 정책을 설정하면 좋겠습니다.
진행사항: 매칭 플로우에 요구되는 테이블·인덱스·로그 스키마를 모두 정리해 이관이나 복구 시 바로 참고할 수 있게 했습니다.
