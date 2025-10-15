# Supabase chat realtime checklist

이 문서는 `/supabase/chat_realtime_backend.sql` 스크립트에 포함된 핵심 DDL/RLS/트리거 세트를 요약합니다. Supabase SQL Editor에서 스크립트를 실행하면 아래 항목이 한 번에 적용됩니다.

## 포함 사항

1. **채팅방 테이블과 RLS**  
   `chat_rooms`, `chat_room_members`를 생성하고 선택/삽입/수정/삭제 정책을 등록합니다. 각 테이블은 `updated_at`/`last_active_at`을 자동으로 갱신하는 트리거를 가집니다.

2. **`messages` 테이블 기본값 및 정책**  
   메시지의 기본값·제약·인덱스를 정리하고, `messages_select_public` 정책이 글로벌/방/세션/귓속말 노출을 제어하도록 구성합니다. 세션 판별을 위해 `is_rank_session_owner_or_roster` 함수도 함께 배포됩니다.

3. **Realtime 권한 및 브로드캐스트**  
   `realtime.messages` 스키마에 인증 사용자용 SELECT 정책을 추가하고, `emit_realtime_payload` + `broadcast_messages_changes` 트리거가 `messages:*` 토픽으로 브로드캐스트하도록 설정합니다.

4. **퍼블리케이션 연결**  
   `supabase_realtime` 퍼블리케이션에 `messages`, `chat_rooms`, `chat_room_members`가 포함되어 Postgres Changes 스트림이 즉시 구독됩니다.

## 사용 방법

1. Supabase 프로젝트 대시보드 → SQL Editor를 열고 `/supabase/chat_realtime_backend.sql` 파일 내용을 그대로 붙여넣은 뒤 실행합니다.
2. 성공 후 Realtime → Database 탭에서 `supabase_realtime` 퍼블리케이션에 위 테이블이 등록됐는지 확인합니다.
3. Realtime 로그에 `topic:messages:*` 이벤트가 올라오는지 살펴보고, 필요 시 클라이언트가 사용하는 토픽과 일치하는지 점검합니다.

스크립트는 재실행해도 안전하도록 `drop ... if exists` / `create ... if not exists` 패턴을 사용합니다.
