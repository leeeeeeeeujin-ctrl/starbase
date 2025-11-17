# Capability: persistence.supabase

> Supabase 테이블에 게임/세션/매치 상태를 영구 저장하는 persistence capability.
> Status: phase 1 spec complete (reference_data + schema 문서와의 매핑; 실제 adapter/wiring은 이후 단계).

---

## 1. Workspace 계약

- **역할**: “이 세트/게임의 상태를 어떤 Supabase 테이블/형태로 남길지”를 정의.
- **필수 파일** (capabilityContracts 기준):
  - `/game/persistence.supabase.json`
    - 설계 예시(문서 수준):
      ```json
      {
        "enabled": true,
        "tables": {
          "sessions": {
            "table": "rank_sessions",
            "mapStateToRow": "mapStateToRow",
            "mapRowToState": "mapRowToState"
          },
          "turns": {
            "table": "rank_turns"
          },
          "battles": {
            "table": "rank_battles",
            "logs": "rank_battle_logs"
          }
        }
      }
      ```
    - 핵심 아이디어:
      - 어떤 상태를 어떤 테이블에 쓰는지,
      - 어떤 훅/함수로 “런타임 상태 ↔ DB row”를 변환하는지 선언.
- **훅 요구사항** (capabilityContracts 기준):
  - `/game/hooks/automation.js` 등에서 다음 함수를 제공하는 것을 권장:
    - `export function mapStateToRow(state) { ... }`
      - 인메모리 게임 상태를 Supabase row 형태로 변환.
    - `export function mapRowToState(row) { ... }`
      - Supabase row를 다시 게임 상태로 복원.

---

## 2. 런타임 계약 (개념 레벨)

현재 이 리포에서는 “세트 자체”에 대한 Supabase 영속화가 먼저 구현돼 있고,  
게임/매치/세션 상태에 대한 persistence는 스키마/문서 수준으로 정의돼 있다.

- 작업공간 세트 영속화:
  - `ai-roomchat/lib/workspace/dbWorkspaceSets.js`
    - `dbGetSet(id)` / `dbCreateIfMissing(id)` / `dbPutSet(id, files, meta, ifMatch)`:
      - Supabase의 `workspace_sets` 테이블에 세트의 `files` + `meta` + `etag`를 저장/로드.
    - 이는 “에디터용 persistence”에 가깝고, 게임 런타임의 상태 persistence는 별도 capability(persistence.supabase)가 담당하게 된다.
- 게임/매치/세션 상태 영속화(개념):
  - persistence.supabase capability는 다음과 같은 형태의 어댑터를 가지는 것을 목표로 한다:
    - `persistence.supabase.client`:
      - `saveSession(state, ctx)`:
        - 현재 세션 상태를 예: `rank_sessions` + `rank_turns` 등 테이블에 upsert/insert.
      - `loadSession(sessionId, ctx)`:
        - DB에서 row들을 읽어, `mapRowToState`를 이용해 게임 상태로 복원.
      - `saveBattle(state, ctx)` / `saveBattleLog(turn, ctx)`:
        - 전투 결과/로그를 `rank_battles` / `rank_battle_logs`에 기록.

---

## 3. Supabase 스키마와의 매핑

Supabase 쪽 스키마는 이미 `supabase.sql`과 여러 문서에 자세히 정의되어 있다.  
persistence.supabase capability는 이 스키마를 “게임 코드가 의존할 수 있는 계약”으로 끌어오는 역할을 한다.

- 참고 문서:
  - `ai-roomchat/docs/matchmaking-schema-reference.md`
  - `ai-roomchat/docs/game-session-store-reference.md`
  - `ai-roomchat/docs/game-system-refactor-report.md`
- 예시 매핑(문서 수준):
  - 세션 상태:
    - 메인 테이블: `public.rank_sessions`
      - 핵심 필드: `id`, `game_id`, `owner_id?`, `status`, `turn_ptr`, `updated_at`.
    - 턴 로그: `public.rank_turns`
      - 필드: `session_id`, `turn_index`, `role`, `public`, `text`, `created_at`.
    - mapStateToRow/mapRowToState:
      - 세션 상태의 “current node id / 현재 턴 / 참여자 id” 등을 row 필드에 어떻게 매핑할지 정의.
  - 배틀/로그:
    - `public.rank_battles`, `public.rank_battle_logs`
      - 전투 결과/로그를 어떻게 두 테이블에 나누어 쓸지, state ↔ row 변환 함수로 규정.
  - 큐/룸/로스터:
    - `rank_rooms`, `rank_room_slots`, `rank_match_queue`, `rank_match_roster` 등은
      network.realtime + matchmaking와 더 긴밀히 연결되며,  
      persistence.supabase는 “최종 세션/로그를 어디에 기록할지”에 집중한다.

---

## 4. reference_data 매핑

persistence.supabase capability는 “게임 서버 + DB” 아키텍처 레퍼런스를 바탕으로 설계된다.

- **Supabase / Postgres 패턴**  
  - `ai-roomchat/docs/matchmaking-schema-reference.md`  
  - `ai-roomchat/docs/supabase-schema-digest.md`  
  - 사용 아이디어:
    - 세션/턴/배틀/로그 테이블 구조와 인덱스, RLS 규칙을 기반으로,
      게임 상태를 어떻게 저장/조회해야 하는지 계약 수준에서 정의.
- **게임 서버 사례**  
  - `reference_data/open-match2-main/`
    - 매치/티켓/결과를 어떻게 저장하는지 참고.
  - `reference_data/engine-main/`
    - 서버 쪽 game loop와 persistence의 경계를 어떻게 나누는지 참고.

1단계에서는 persistence.supabase를 “어떤 파일/훅/테이블/레퍼런스 문서와 연결되는 capability인지”만 명확히 해 두고,  
실제 Supabase 클라이언트 어댑터(`persistence.supabase.client`) 구현과 게임 런타임에서의 호출 시점은 이후 단계에서 차근차근 붙여 나간다.

