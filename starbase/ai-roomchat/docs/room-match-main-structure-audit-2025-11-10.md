# 방 → 매칭 → 메인게임 구조 불일치 점검 (2025-11-10)

## 1. 요약
- 방 화면(`/rooms/[id]`)은 모든 슬롯이 준비 완료인지 확인한 뒤에만 `stageMatch`를 호출하지만, 서버의 `/api/rank/stage-room-match`는 해당 조건을 검증하지 않아 직접 호출이나 경쟁 상황에서 준비 상태가 무시될 수 있습니다.【F:pages/rooms/[id].js†L2867-L2944】【F:pages/api/rank/stage-room-match.js†L214-L336】
- 수동으로 방을 통해 본게임을 여는 흐름은 `/api/rank/start-session`을 호출하지 않아 `MatchReady` 단계의 준비 투표가 세션 ID 없이 진행되며, `ready-check` RPC가 즉시 `missing_session_id` 오류를 반환합니다.【F:pages/rooms/[id].js†L2922-L3089】【F:components/rank/MatchReadyClient.js†L806-L856】【F:pages/api/rank/ready-check.js†L146-L219】
- `stageMatch`가 난입/비어 있는 슬롯을 채우며 생성한 `asyncFillMeta`는 로컬 스토어에만 저장되고 Supabase에 영속화되지 않아, `MatchReady`가 `fetch_rank_match_ready_snapshot`으로 다시 동기화하면 해당 메타 정보가 사라집니다.【F:pages/rooms/[id].js†L2922-L3078】【F:lib/rank/matchFlow.js†L320-L368】【F:modules/rank/matchRealtimeSync.js†L1140-L1456】

## 2. 불일치 상세 및 제안

### 2.1 준비 상태 미검증 스테이징
- **문제**: 클라이언트는 인원 충족·준비 투표 만료 여부를 모두 확인하지만 서버는 슬롯/준비 여부를 확인하지 않습니다. 경쟁하는 탭이나 API 호출로 `/api/rank/stage-room-match`를 직접 호출하면 준비가 덜 된 상태에서도 매치가 스테이징됩니다.
- **제안**: `sync_rank_match_roster` 호출 전에 `rank_room_slots`/`rank_session_ready_signals`를 검사하는 RPC를 추가하고, 조건을 만족하지 않으면 예외를 반환하도록 합니다.
- **예시 SQL**:
  ```sql
  create or replace function public.assert_room_ready(p_room_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_required integer;
    v_ready integer;
  begin
    select count(*), count(*) filter (where occupant_ready)
      into v_required, v_ready
    from public.rank_room_slots
    where room_id = p_room_id;

    if v_required = 0 then
      raise exception 'room_empty';
    end if;

    if v_ready < v_required then
      raise exception 'ready_check_incomplete';
    end if;
  end;
  $$;
  ```
  이후 `stage-room-match`에서 `assert_room_ready`를 호출해 서버도 동일한 조건을 강제합니다.

### 2.2 세션 생성 누락으로 인한 준비 투표 실패
- **문제**: 수동 방 흐름은 스테이징 직후 `MatchReady`로 이동하지만 `rank_sessions` 행이 존재하지 않아 `ready-check` API가 거부합니다. 자동 매칭(`AutoMatchProgress`)은 확인 단계에서 `start-session`을 호출하지만, 방 → 매치 전환은 동일 로직이 없습니다.
- **제안**: 방에서 `stageMatch`가 성공하면 즉시 새 RPC(예: `ensure_rank_session_for_room`)를 호출하거나 기존 `/api/rank/start-session`을 재사용해 세션을 생성/갱신합니다. 토큰을 재활용하고 모드·턴 제한 투표 결과를 함께 전달해 메인 게임과 동일하게 유지하세요.
- **예시 SQL**:
  ```sql
  create or replace function public.ensure_rank_session_for_room(
    p_room_id uuid,
    p_game_id uuid,
    p_owner_id uuid
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_session_id uuid;
  begin
    select id
      into v_session_id
    from public.rank_sessions
    where game_id = p_game_id
      and owner_id = p_owner_id
      and status = 'active'
    order by updated_at desc
    limit 1;

    if v_session_id is null then
      insert into public.rank_sessions (game_id, owner_id, status, turn)
      values (p_game_id, p_owner_id, 'active', 0)
      returning id into v_session_id;
    else
      update public.rank_sessions
        set updated_at = now()
      where id = v_session_id;
    end if;

    return v_session_id;
  end;
  $$;
  ```
  클라이언트에서는 `stage-room-match` 성공 후 세션 ID를 확보해 `MatchReady`로 전달하고, 준비 투표 UI가 `sessionId` 없이 열리지 않도록 가드합니다.

### 2.3 난입 메타 손실
- **문제**: 스테이징 중 채워진 난입 정보(`asyncFillMeta`)는 `setGameMatchSessionMeta`로만 보관됩니다. `MatchReady`가 Supabase 스냅샷을 읽어오면 `rank_session_meta.async_fill_snapshot`이 비어 있어 로컬 메타가 덮어쓰여 난입/큐 진단 정보가 사라집니다.
- **제안**: `sync_rank_match_roster` 이후 동일 메타를 `rank_session_meta`에 저장하는 RPC를 호출하거나, 새로운 `upsert_rank_session_async_fill` 함수를 만들어 `asyncFillMeta`를 영속화합니다. 이렇게 하면 `fetch_rank_match_ready_snapshot`과 실시간 채널이 동일한 난입 상태를 전파합니다.
- **예시 SQL**:
  ```sql
  create or replace function public.upsert_rank_session_async_fill(
    p_session_id uuid,
    p_async_fill jsonb
  )
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    update public.rank_session_meta
       set async_fill_snapshot = p_async_fill,
           updated_at = now()
     where session_id = p_session_id;

    if not found then
      insert into public.rank_session_meta (session_id, async_fill_snapshot)
      values (p_session_id, p_async_fill);
    end if;
  end;
  $$;
  ```
  클라이언트는 `stageMatch` 완료 후 세션 ID를 확보한 뒤 위 함수를 호출해 난입 메타를 저장하도록 조정합니다.

## 3. 다음 단계
1. `docs/rank-room-rpc-hardening-plan-2025-11-10.md`에 정리한 순서대로 `assert_room_ready`·`ensure_rank_session_for_room`·`upsert_rank_session_async_fill` RPC를 배포하고 `/api/rank/stage-room-match` 경로에 통합합니다.
2. `stageMatch`가 세션 ID와 난입 메타를 서버에 전달하도록 수정하고, `MatchReady`는 Supabase 스냅샷이 준비될 때까지 준비 투표 UI를 지연시킵니다.
3. 운영 환경에서 준비 투표 → 본게임 전환을 재검증해 `ready-check`/`async_fill_snapshot`이 모두 채워지는지 확인합니다.
