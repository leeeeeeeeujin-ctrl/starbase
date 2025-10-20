# Rank 매칭 어댑터 레이어 가이드

## 개요
`lib/rank/matching.js` 유틸은 **역할 슬롯 정보**와 **매칭 대기열**을 범용 형태로 정규화해 점수 윈도 확장, 중복 제거, 슬롯 배정까지 처리합니다. 실제 Supabase 스키마에서 필드명이 다르더라도 어댑터 레이어만 맞춰 주면 동일한 헬퍼를 재사용할 수 있습니다.

이 문서는 어댑터가 기대하는 최소 컬럼과, Supabase에 추가해야 할 경우의 SQL 예시를 정리했습니다.

## 필요 데이터 요약

| 구분 | 설명 | 기본 키 | 필수 컬럼 | 선택 컬럼 |
| --- | --- | --- | --- | --- |
| **역할 슬롯** | 한 게임에서 활성화된 역할과 슬롯 수 | `game_id` + `role_name` | `role_name`, `slot_count` | `role_id` |
| **대기열** | 매칭을 기다리는 참가자 | 고유 `id` | `role`, `owner_id`, `score` | `hero_id`, `joined_at` |

`matching.js`는 아래 프로퍼티만 있으면 동작합니다.

```ts
type RoleSlot = {
  name: string;      // role_name
  slot_count: number;
}

type QueueEntry = {
  role: string;      // 참가자가 신청한 역할
  score?: number;    // mmr/rating/score 중 하나
  joined_at?: string | number; // ISO 문자열 또는 epoch ms
  id?: string | number;        // 고유 식별자
  owner_id?: string;           // 충돌 방지용 (fallback)
  hero_id?: string;            // fallback 키 구성에 사용
}
```

## Supabase 컬럼 권장안

### 1. 역할 슬롯 테이블 (`rank_game_roles` or `rank_game_slots`)

이미 `rank_game_roles(slot_count)`를 사용 중이라면 별도 작업이 필요 없습니다. `matching.js`는 역할 배열에서 `name`과 `slot_count`만 읽어오므로, 해당 컬럼이 정확하면 됩니다.

만약 **JSON 컬럼** 등에만 슬롯 정보가 있다면, 다음과 같이 보조 테이블을 만들어 두면 어댑터 작성이 간단합니다.

```sql
create table if not exists public.rank_game_role_caps (
  game_id     uuid    not null,
  role_name   text    not null,
  slot_count  int     not null default 1,
  primary key (game_id, role_name)
);
```

어댑터에서는 `select role_name as name, slot_count from rank_game_role_caps where game_id = :id` 로 읽어 `matchRankParticipants`에 넘기면 됩니다.

### 2. 매칭 대기열 테이블

실시간 매칭을 위해선 역할·점수·대기 시간 정보를 갖는 큐 테이블이 필요합니다. 아래 예시는 `rank_match_queue`라는 이름을 가정했습니다.

```sql
create table if not exists public.rank_match_queue (
  id          uuid        not null default gen_random_uuid(),
  game_id     uuid        not null,
  mode        text        not null default 'solo',
  owner_id    uuid        not null,
  hero_id     uuid        null,
  role        text        not null,
  score       int         not null default 1000,
  joined_at   timestamptz not null default now(),
  status      text        not null default 'waiting',
  match_code  text        null,
  primary key (id)
);

create index if not exists rank_match_queue_game_idx
  on public.rank_match_queue (game_id, mode, role, status, joined_at);
```

어댑터는 이 테이블에서 `status = 'waiting'` 상태만 읽어 `matchRankParticipants({ roles, queue })`에 전달하면 됩니다. `matching.js`는 점수 필드가 없으면 `rating` 또는 `mmr`을 자동으로 찾고, 그마저 없으면 1000을 기본값으로 사용하므로 다른 스코어 컬럼을 쓰고 싶다면 SELECT 시 별칭만 맞춰 주면 됩니다.

예)

```js
const { data: queue } = await supabase
  .from('rank_match_queue')
  .select('id, role, owner_id, hero_id, score, joined_at')
  .eq('game_id', gameId)
  .eq('status', 'waiting')

const matches = matchRankParticipants({ roles, queue })
```

### 3. 점수·타임스탬프 명칭이 다를 때

`matching.js`는 아래 필드명을 순차적으로 탐색합니다.

* 점수: `score → rating → mmr`
* 타임스탬프: `queue_joined_at → joined_at → queued_at → created_at → updated_at`

따라서 기존 스키마의 필드명이 다르면 **SELECT 시 별칭을 맞추거나**, 어댑터 단계에서 `{ score: row.my_rating }`처럼 매핑해 주면 됩니다. 별도 컬럼을 새로 만들 필요는 없습니다.

## 어댑터 구현 예시

```js
import { matchRankParticipants } from '@/lib/rank/matching'

export async function runRankMatching(supabase, gameId) {
  const { data: roleCaps } = await supabase
    .from('rank_game_roles')
    .select('name, slot_count')
    .eq('game_id', gameId)
    .eq('active', true)

  const { data: queue } = await supabase
    .from('rank_match_queue')
    .select('id, role, owner_id, hero_id, score, joined_at')
    .eq('game_id', gameId)
    .eq('status', 'waiting')

  return matchRankParticipants({ roles: roleCaps ?? [], queue: queue ?? [] })
}
```

## 요약
- **추가 테이블 없이도** 현재 `rank_game_roles`와 매칭 큐에 필요한 최소 필드가 있으면 어댑터를 만들 수 있습니다.
- 만약 슬롯 정보가 흩어져 있다면 `game_id + role_name + slot_count` 구조의 보조 테이블을 만드는 것이 가장 간단합니다.
- 매칭 큐에는 `role`, `score`, `joined_at` 정도만 있어도 동작하며, 필드명이 다르면 SELECT 별칭이나 자바스크립트 매핑으로 해결 가능합니다.

필요한 컬럼을 새로 만들거나 이름을 바꾸려 할 때 이 문서를 참고해 주세요.
