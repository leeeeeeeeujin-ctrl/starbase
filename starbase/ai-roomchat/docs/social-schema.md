# Social Features Schema Overview

이 문서는 Supabase Social 확장 스크립트(`supabase_social.sql`)로 생성되는 핵심 테이블 구조를 요약합니다. 실제 프로젝트의 다른 SQL 스크립트(supabase.sql 등)와 함께 실행되어야 하며, 아래 정보는 `friend_requests`, `friendships`, `game_likes`, `game_sessions`, `game_slots`, `game_versions`, `games`, `global_chat_messages`, `heroes`, `like_events`, `messages`, `profiles`, `prompt_bridges`, `prompt_histories`, `prompt_sets` 테이블을 빠르게 파악하기 위한 참고용입니다.

## friend_requests
- **주요 역할**: 친구 요청의 상태와 메시지를 관리합니다.
- **중요 컬럼**
  - `requester_id`, `addressee_id`: 요청자·수신자(`auth.users.id` 참조).
  - `status`: `pending`, `accepted`, `declined`, `cancelled` 중 하나.
  - `message`: 선택적 인사말.
  - `responded_at`: 요청에 응답한 시각. `pending`이 아닌 상태로 변경될 때 자동으로 기록됩니다.

## friendships
- **주요 역할**: 확정된 친구 관계를 저장합니다.
- **중요 컬럼**
  - `user_id_a`, `user_id_b`: 친구 쌍(`auth.users.id` 참조). `user_id_a < user_id_b` 제약으로 중복을 방지합니다.
  - `since`: 친구가 된 시각.

## games / game_versions / game_sessions / game_slots
- **games**: 제작자가 등록한 게임의 기본 정보(이름, 설명, 커버 이미지 경로)를 보관합니다.
- **game_versions**: 각 게임의 버전·배포 여부를 추적합니다.
- **game_sessions**: 특정 게임 버전으로 생성된 세션 정보를 기록합니다. `started_by`와 `mode`(`casual` 기본값)를 포함합니다.
- **game_slots**: 세션 슬롯에 배치된 영웅을 나타냅니다. `slot_no`로 순서를 관리합니다.

## game_likes & like_events
- **game_likes**: 게임에 좋아요를 누른 사용자 목록(단순 관계)을 저장합니다.
- **like_events**: 좋아요/취소와 같은 액션 이벤트를 이벤트 스트림 형태로 축적합니다. `day_key`와 `action`으로 통계를 낼 수 있습니다.

## heroes
- **주요 역할**: 사용자 생성 영웅의 프로필과 능력치를 저장합니다.
- **중요 컬럼**: 이름, 설명, 4개 능력(`ability1`~`ability4`), 이미지/배경/BGM 관련 메타데이터 등.

## hero_bgms
- **주요 역할**: 각 영웅이 보유한 브금(최대 8개)의 종류·경로·메타데이터를 관리합니다.
- **중요 컬럼**
  - `hero_id`: 소유 영웅(`heroes.id` 참조).
  - `label`: 브금 종류(예: 기본, 전투 등) 라벨.
  - `url` / `storage_path`: 공개 URL과 스토리지 상 경로.
  - `duration_seconds`, `mime`: 길이와 파일 형식 정보를 저장합니다.
  - `sort_order`: 대표 순서를 관리하며 0번이 재생 기본값입니다.

## global_chat_messages & messages
- **global_chat_messages**: 실시간 글로벌 채팅 메시지를 저장하는 간단한 로그 테이블입니다.
- **messages**: 범용 메시지 로그로, `scope` 기본값이 `global`이며, 귓속말(`target_hero_id`)이나 메타데이터(JSONB)를 지원합니다.

## profiles
- Supabase Auth 사용자와 매핑되는 프로필 테이블입니다. `username`, `avatar_url` 등을 저장합니다.

## prompt_sets / prompt_bridges / prompt_histories
- **prompt_sets**: 프롬프트 묶음의 메타데이터.
- **prompt_bridges**: 프롬프트 슬롯 간 연결 규칙과 조건을 정의합니다. `trigger_words`, `priority`, `probability`, `fallback` 등 고급 제어를 지원합니다.
- **prompt_histories**: 세션 중 발생한 입력/출력 기록을 보관합니다.

### prompt_library_entries
- 사용자들이 공개로 공유한 프롬프트 세트 번들을 저장합니다.
- `payload` 컬럼에는 `prompt_sets`, `prompt_slots`, `prompt_bridges` 데이터를 번들 형태(JSON)로 보관합니다.
- `download_count`는 Supabase RPC(`increment_prompt_library_downloads`)를 통해 증가하며, 목록 정렬에도 활용됩니다.
- `set_id`는 원본 세트와의 매핑을 유지하기 위한 `unique` 키로, 업로드 후 수정 시 기존 레코드가 갱신됩니다.

---
최근 스키마 상태는 Supabase 대시보드 `Table editor`에서 확인하고, 변경 사항은 `supabase_social.sql`에 반영하세요.
