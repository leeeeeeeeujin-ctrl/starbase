# Hero 메타데이터와 Supabase `heroes` 테이블

채팅과 친구 기능에서 말하는 "hero"는 데이터베이스의 한 행(row)을 들고
있는 **자바스크립트 객체**입니다. 이 객체는 Supabase의 `public.heroes`
테이블(또는 환경에 따라 `rank_heroes` 뷰 등)에서 조회한 결과를 그대로
사용하며, 별도의 `hero` 단일 테이블은 존재하지 않습니다.

## 왜 이름이 다르게 들릴까?

- UI 컴포넌트와 훅은 "현재 선택된 hero"처럼 **도메인 용어**를 단수형으로
  표현합니다.
- 실제 데이터 fetch는 `withTable(supabase, 'heroes', ...)` 형태로 수행되며,
  `withTable` 헬퍼가 논리명 `heroes`를 실제 물리 테이블 이름으로 매핑해
  줍니다. 기본값은 `heroes`지만, 필요하면 `rank_heroes` 같은 뷰도 자동으로
  시도합니다.
- 따라서 코드에서 `hero.hero_id`처럼 보이는 필드들은 모두 `heroes`
  테이블에서 읽어온 컬럼(`id`, `owner_id`, `image_url` 등)을 의미합니다.

## 확인 포인트

1. Supabase SQL 콘솔에서 `select * from public.heroes limit 5;`를 실행하면
   UI에서 다루는 hero 데이터가 그대로 조회됩니다.
2. 캐시/스토리지에 저장되는 값(`selectedHeroId`, `selectedHeroOwnerId`) 역시
   이 테이블의 기본키(`id`)와 소유자(`owner_id`)를 그대로 보관합니다.
3. 다른 환경에서 테이블 이름이 다르다면 `lib/supabaseTables.js`의
   `FALLBACK_TABLES.heroes` 배열에 후보를 추가하면 됩니다.

이 구조 덕분에 "hero"라는 용어는 전부 `heroes` 테이블의 행을 의미한다고
이해하면 되고, 별도의 스키마를 걱정할 필요가 없습니다.

## 공용 채팅 독을 그대로 복붙하고 싶다면?

- `SharedChatDockProvider`로 원하는 레이아웃을 감싸면 로스터/랭킹/캐릭터
  등 어느 페이지에서도 **같은 메시지 스트림·차단 목록·귓속말 스레드**를
  공유할 수 있습니다.
- 내부에서 `useSharedChatDock()`을 호출하면 `totalUnread`,
  `blockedHeroes`, `setBlockedHeroes`, `viewerHeroId` 등을 꺼내어 상단
  배지나 친구 오버레이와 연결할 수 있습니다.
- 예시: 로스터 화면은 전체 트리를
  `SharedChatDockProvider`로 감싸고, `RosterView`는
  `useSharedChatDock()`이 돌려주는 `totalUnread`를 그대로 배지로 렌더링해
  새로고침/탭 전환과 관계없이 동일한 채팅 상태를 유지합니다.
- 별다른 설정이 없어도 `SharedChatDock` 컴포넌트는 같은 컨텍스트를 읽어
  즉시 메시지 리스트·입력창을 재사용하므로 원하는 위치에 복사해 붙여
  넣기만 하면 됩니다.

