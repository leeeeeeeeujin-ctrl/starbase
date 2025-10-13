# Rank Match Overhaul Blueprint (2025-11-12)

## 목표
- 방 기반 의존도를 제거하고 **매칭 → 준비 투표 → 본게임 → 정산** 흐름을 단일 세션 모델로 간소화한다.
- 모든 데이터 읽기/쓰기를 Supabase RPC 및 뷰에 위임해 클라이언트가 얇은 오케스트레이션 레이어로만 남도록 한다.
- Realtime은 세션 상태(큐, 투표, 턴, 점수) 스트림에 집중하고, 브라우저 상태는 임시 캐시와 로컬 UX에만 사용한다.
- 페이지 수를 6개 내외로 제한하여 운영/디버깅 동선을 줄이고, 각 페이지가 명확한 역할을 갖도록 설계한다.

## 페이지 구성 (총 6페이지)
1. `/` – **타이틀 허브 + Arcade Overview**
   - 홈 화면에서 타이틀 → 로스터 → 캐릭터(로비) 흐름을 가장 먼저 안내하고, 기존 진입 동선을 유지한다.
   - Arena 섹션은 방 검색 대체 수단으로 별도 블록에 배치해 필요할 때만 접근하도록 한다.
2. `/arena/queue` – **Match Queue & Seat Picker**
   - `join_rank_queue(payload)` RPC 호출로 대기열 합류.
   - Realtime 스트림으로 큐 상태, 투표 초읽기 이벤트 수신.
3. `/arena/staging` – **Ready Vote & 타이머**
   - `stage_rank_match(queue_ticket_id)` RPC로 세션 생성/검증.
   - 15초 제한 준비 투표, 미준비 인원 자동 퇴장.
4. `/arena/sessions/[sessionId]` – **Main Game Shell**
   - 턴 로그(`fetch_rank_session_turns`)와 공개/비공개 메시지 슬롯 표시.
   - 턴 제한 투표 결과와 남은 시간 노출.
5. `/arena/sessions/[sessionId]/score` – **Post-Match Settlement**
   - `finalize_rank_session(session_id)` RPC 상태 확인.
   - 점수, 보상, 리플레이 진입 지름길.
6. `/arena/control` – **운영/디버그 콘솔**
   - 큐 리셋, 세션 재동기화, publication 검사 등을 수행.

### 기존 페이지 접근성 유지
- 로비(`/lobby`), 방 목록(`/rooms`), 로스터(`/roster`), 메이커(`/maker`), 메인룸(`/play`) 등 기존 기능은 그대로
  유지한다.
- `/` 허브와 `ArcadeLayout` 네비게이션에 동일 링크를 배치해 Arena 흐름과 레거시 방 시스템을 동시에 비교하거나
  빠르게 오갈 수 있다.
- 문서/데모 작성 시 Arena 구조와 기존 방 구조를 병렬로 서술해 팀원별로 점진적으로 전환할 수 있도록 한다.
- 네비게이션의 "기본 흐름" 블록에는 타이틀 → 로스터 → 캐릭터(로비) 링크를 먼저 노출하고,
  Arena/운영 링크는 별도 섹션으로 내려 사용자 동선이 꼬이지 않도록 한다.

## 모듈 구조
- `modules/arena/rpcClient.js`
  - Supabase 클라이언트를 래핑해 RPC 호출, 에러 표준화, 타임아웃 처리.
- `modules/arena/realtimeChannels.js`
  - 큐/세션 채널 구독, cleanup helper.
- `modules/arena/ticketStorage.js`
  - 큐 티켓을 세션 스토리지에 보관해 페이지 간 흐름을 공유.
- `components/arena/*`
  - 페이지별 UI 조각을 분리 (QueuePanel, ReadyTimer, SessionTurns, ScoreSummary, OpsPanel 등).

## 단계별 실행 계획
1. **청소 & 기반 정비**
   - 기존 방 상세 페이지 의존 로직 제거, 신규 스토어/컴포넌트 도입.
   - 준비 투표/자동 퇴출 로직을 RPC 호출 + Realtime 이벤트로 대체.
2. **페이지 구축**
   - 각 페이지에 필요한 데이터 fetch/realtime 구독을 구현.
   - 공통 레이아웃(`ArcadeLayout`)으로 UX 일관성 확보.
3. **RPC 연동**
   - `join_rank_queue`, `stage_rank_match`, `finalize_rank_session`, `fetch_rank_session_turns` 등 서버 함수 정의 및 문서화.
   - 클라이언트에서 RPC 호출 실패 시 명확한 가이던스 제공.
4. **Realtime 통합**
   - 큐/세션 채널 구독 유틸 구현, 페이지별 구독 흐름 통합.
   - 준비 투표 타임라인과 세션 턴 로그 스트림을 구독해 UI 동기화.
5. **운영 자동화**
   - `/arena/control`에서 publication, TTL, 크론 상태를 점검할 수 있는 UI 제공.
   - 문서(`docs/refactor-blueprint-2025-11-12.md`)에 크론, 권한, 마이그레이션 체크리스트 포함.
6. **테스트 & 검증**
   - `npm run build` 및 주요 상호작용 스냅샷 테스트 추가.
   - 스테이징에서 RPC 배포/Realtime 구독 체크리스트 수행.

## 마이그레이션 & 권한 체크리스트
- Supabase Functions
  - `join_rank_queue(payload jsonb)`
  - `stage_rank_match(p_queue_ticket uuid)`
  - `fetch_rank_session_turns(p_session_id uuid, p_limit integer)`
  - `finalize_rank_session(p_session_id uuid)`
  - `rank_session_watch_channel(p_session_id uuid)` (옵션)
- Publication
  - `rank_queue_tickets`, `rank_sessions`, `rank_session_meta`, `rank_turns`
- Policies & Grants
  - `authenticated` 롤에 위 RPC 실행 권한, `rank_turns`/`rank_sessions` select 권한 부여.
- Cron / Edge Functions
  - 세션 TTL 정리, 큐 정리 크론 재점검.

## 후속 작업
- Arena 흐름과 기존 방 UI를 병행 운영하면서, 세션 중심 모델이 안정화되면 페이지/컴포넌트 레벨에서 중복을 정리한다.
- MatchReadyClient는 `/arena/staging` 중심으로 재사용하되, 필요 시 방 상세 화면에서도 RPC 검증 로직을 공유할 수 있도록 준비한다.
- 세션 채팅/리플레이 기능은 `/arena/sessions/[sessionId]` 내에서 기본 제공하지만, 기존 메인룸과도 연동 경로를 검토한다.

