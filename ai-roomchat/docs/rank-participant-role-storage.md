# Rank Participant Role Storage

게임 랭크 매치에서 각 참여자의 역할(role)은 Supabase `rank_participants` 테이블에 저장됩니다. 이 테이블은 다음과 같은 주요 칼럼을 포함합니다:

- `game_id`: 역할이 속한 게임 식별자
- `owner_id`: 참여자(플레이어) 식별자
- `role`: 참여자에게 할당된 역할 이름
- `slot_no`: 슬롯 기반 역할 배치 시 사용되는 번호

`role` 필드는 게임별로 어떤 참여자가 어떤 역할을 맡는지 추적하는 데 사용됩니다. 테이블 정의는 `supabase.sql`에서 확인할 수 있으며, `rank_participants`에 `role text` 칼럼이 선언되어 있습니다.

또한 이 테이블은 `game_id`와 `owner_id`의 조합을 고유하게 유지하며, `rank_participants_active_by_role` 인덱스로 게임별 역할 조회를 최적화하고 있습니다.
