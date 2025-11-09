# Rank Turn History Integration Spec

## 목표

- `rank_turns` 테이블에 쌓인 로그를 메인 룸과 전투 클라이언트에서 일관되게 표시한다.
- 프라이버시 요구 사항에 따라 공개 범위를 제어하고, 인비저블(invisible) 라인이 숨겨지도록 보장한다.
- 신규 참가자가 빠르게 상황을 파악할 수 있도록 요약/타임라인 뷰를 제공한다.
- AI 프롬프트/응답 재생과 사용자 입력 복원 기능을 위한 데이터 구조를 정리한다.

## 데이터 소스

| 테이블              | 주요 컬럼                                                                                                              | 설명                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `rank_turns`        | `id`, `session_id`, `turn`, `visibility`, `speaker_type`, `speaker_id`, `prompt`, `response`, `metadata`, `created_at` | 턴 단위 로그 저장소. `visibility`는 `public`, `party`, `private`, `invisible` 네 단계로 정의한다. |
| `rank_sessions`     | `id`, `game_id`, `owner_id`, `status`, `turn`, `created_at`, `updated_at`                                              | 세션 헤더. 룸 히스토리 패널의 그룹핑 기준이 된다.                                                 |
| `rank_participants` | `owner_id`, `hero_id`, `role`, `status`, `score`                                                                       | 히스토리를 뷰어별로 필터링할 때 필요한 권한 판단 근거.                                            |

### 인덱스/뷰 제안

- `rank_turns_session_turn_idx (session_id, turn)` : 턴 정렬용.
- `rank_turns_visibility_idx (session_id, visibility)` : 가시성 필터링.
- `rank_turns_public_view` : `visibility IN ('public', 'party')` 조건을 가지는 뷰. 메인 룸 히스토리에서 다른 참가자 기록을 노출할 때 사용.

## 클라이언트 요구 사항

1. **메인 룸 히스토리 탭**
   - `useGameRoom`가 `rank_sessions` 최근 N건(기본 10건)과 각 세션의 `rank_turns` 중 공개 범위에 해당하는 항목을 페이징으로 가져온다.
   - 뷰어 소유 세션은 `visibility` 구분 없이 전체를 노출하고, 타인 세션은 `public`/`party`까지만 표시한다.
   - 새로 입장한 참가자에게는 최근 세션 1건을 자동으로 펼치고, 60초 카운트다운과 함께 “히스토리를 검토하세요” 안내 배너를 띄운다.

2. **전투 클라이언트(AI 전용 히스토리)**
   - `StartClient`가 현재 세션 ID를 알고 있으므로, 턴 진행 시마다 `rank_turns`를 스트리밍하거나 폴링해 AI가 참고할 수 있는 히스토리를 유지한다.
   - `visibility`가 `invisible`인 라인은 사용자에게는 숨기되, AI 호출 시에는 항상 포함해 맥락 유지.
   - 과거 턴을 재전송할 때는 `metadata`에 저장한 `prompt_variables` 스냅샷을 활용해 동일한 프롬프트를 재조합한다.

3. **히스토리 요약 카드**
   - 각 세션 헤더에는 다음 정보를 표시한다:
     - `세션 시작 시각 (created_at)`
     - `참가자 목록` (가시성 규칙을 준수한 이름/영웅)
     - `최종 결과` (승리/패배/탈락 등)
   - 턴 리스트는 모바일 세로 레이아웃을 고려해 아코디언 구조(최대 5줄 미리보기 + "더보기" 버튼)를 사용한다.

## API 스펙

### `GET /api/rank/sessions`

- **Query**: `gameId`, `limit`, `cursor`.
- **Headers**: Supabase auth token.
- **Response**:
  ```json
  {
    "sessions": [
      {
        "id": "...",
        "owner_id": "...",
        "status": "in_progress",
        "turn": 12,
        "created_at": "2025-10-01T12:34:56Z",
        "summary": {
          "participants": [
            { "owner_id": "u1", "hero_id": "h1", "role": "공격", "status": "active" }
          ],
          "result": "in_progress"
        },
        "turns": [
          {
            "id": "...",
            "turn": 12,
            "speaker_type": "ai",
            "speaker_id": "system",
            "prompt": "...",
            "response": "...",
            "visibility": "public",
            "metadata": { "prompt_variables": { "slot1": "..." } },
            "created_at": "..."
          }
        ]
      }
    ],
    "nextCursor": "..."
  }
  ```
- **권한**: 요청자 소유 세션은 전체, 타인 세션은 가시성 필터 적용. Edge Function 또는 RLS 정책 조정으로 보호.

### `GET /api/rank/sessions/[sessionId]/turns`

- 단일 세션을 세부적으로 볼 때 사용. AI 히스토리 뷰와 QA 툴에서 재사용한다.
- `invisible` 라인은 `?includeInvisible=true` 파라미터가 있고, 이때는 서비스 롤 인증을 요구.

## 클라이언트 구현 로드맵

1. `useGameRoom`에 `loadSessionHistory` 함수를 추가해 `/api/rank/sessions`를 호출하고 상태를 전역 캐시에 저장.
2. `GameRoomView` 히스토리 패널을 `SessionHistoryPanel` 컴포넌트로 분리하고, 요약 카드·아코디언 UI를 구현.
3. `StartClient`에 `useSessionHistory` 훅을 도입해 턴 진행 시 `rank_turns`를 폴링/구독하며, `promptVariables`를 AI 호출에 주입.
4. 새 참가자 진입 시 `useMatchQueue` 또는 `useGameRoom`에서 60초 카운트다운 타이머를 시작하고, 배너/음성 안내를 표시.
5. QA/운영을 위해 관리자 전용 페이지(`/rank/[id]/sessions`)에 세션 리스트와 visibility 별 필터 기능을 제공.

## 추적 및 모니터링

- 히스토리 API 호출 실패 시 `console.warn`과 Sentry 이벤트를 남긴다.
- 세션 히스토리 로딩 시간, 첫 페인트까지의 평균 지연을 로깅해 UX 개선 지표로 사용한다.
- AI가 보는 히스토리와 사용자에게 보이는 히스토리가 다를 때를 대비해 `metadata.diffHash` 필드를 두고 양쪽에서 비교한다.

## 마이그레이션 체크리스트

1. `rank_turns` 테이블에 `visibility` ENUM과 `metadata JSONB` 컬럼이 없다면 추가한다.
2. 기존 로그에 기본값(`visibility='public'`)을 채우는 백필 스크립트를 실행한다.
3. `rank_turns_session_turn_idx`, `rank_turns_visibility_idx` 인덱스를 생성한다.
4. `rank_turns_public_view` 생성 후, RLS 정책을 다음과 같이 정의한다:
   ```sql
   create policy "Public turn access" on rank_turns_public_view
   for select using (
     auth.uid() = owner_id
     or visibility in ('public', 'party')
   );
   ```
5. Edge Function 혹은 Supabase RPC로 `GET /api/rank/sessions`에 해당하는 데이터를 효율적으로 반환하는 쿼리를 마련한다.

## 예상 리스크와 대응

- **데이터 폭증**: 장기적으로 턴 로그가 많아지면 페이징/요약 전략이 필요하다 → `nextCursor` 기반 무한 스크롤 구현.
- **가시성 누락**: 잘못된 RLS로 인해 비공개 데이터가 노출될 수 있다 → QA 단계에서 실제 권한 계정으로 검증.
- **AI 히스토리 불일치**: 실시간 갱신이 늦어질 수 있으므로 폴링 주기와 옵티미스틱 업데이트 전략을 조정한다.

---

느낀 점: 턴 히스토리를 문서화하면서 메인 룸과 전투 클라이언트가 공유해야 할 데이터가 또렷해져 다음 구현 순서가 명확해졌습니다.
추가로 필요한 점: RLS 정책과 API 응답 스키마를 실 데이터에 맞춰 테스트해 프라이버시 누수 없이 동작하는지 검증해야 합니다.
진행사항: `rank_turns` 기반 히스토리 통합 사양을 작성해 클라이언트·서버 구현에 필요한 요구사항과 마이그레이션 체크리스트를 마련했습니다.
