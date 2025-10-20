# ai-roomchat (Pages Router + JS, minimal)

**코드는 0, Supabase만 남았다** 가정으로 최소 재구축용 스타터.
- Pages Router + JavaScript (TS/앱 라우터 관련 에러 회피)
- 로그인(OAuth), 히어로 생성/조회, 공개 채팅(옵션)

## 0) 환경변수
`.env.example` 참고해서 `.env.local` 작성. 서버 전용 환경 변수는 [`docs/environment-variables.md`](docs/environment-variables.md)에 정리돼 있으니 배포 전에 필수 항목을 확인하세요.
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 1) 설치 & 실행
```bash
npm install
npm run dev
# http://localhost:3000
```

## 2) Supabase 설정
1) **Auth > Providers > Google**
- Redirect URI(로컬): `http://localhost:3000/auth-callback`
- (배포) `https://<도메인>/auth-callback`
- Authorized JavaScript Origins에도 로컬/배포 도메인 추가

2) **SQL Editor**에서 아래 파일 실행
- `supabase.sql`  (heroes 테이블 + RLS + storage 정책)
- `supabase_chat.sql`  (messages 테이블 + RLS)  ※ 채팅 쓸 때

3) **Storage** 버킷
- 이름 `heroes` 로 생성 → `supabase.sql` 정책 적용됨

4) **Realtime**
- Project > Realtime > Database > Tables → `messages` Enable

## 3) 라우트
- `/` : 홈 + 로그인 버튼
- `/auth-callback` : OAuth 콜백 처리
- `/create` : 캐릭터 생성(이미지 업로드 → storage: heroes)
- `/roster` : 내 캐릭터 목록
- `/chat` : 공개 채팅(옵션)

## 4) 구조 메모 (요약)
- **테이블 자동 매핑** – `lib/supabaseTables.js`의 `withTable`이 논리 테이블 이름을 다중 후보로 시도하고, 성공한 물리 테이블을 캐시해 환경마다 다른 스키마(`heroes`, `rank_heroes` 등)를 투명하게 감싸줍니다.【F:lib/supabaseTables.js†L1-L64】
- **랭킹 전투 준비 화면** – 2025년 3월부터 `StartClient`는 방에서 전달된 매칭 스냅샷을 검증하고 참가자·메타 정보를 보여 주는 간소화된 준비 UI로 동작합니다. 전투 엔진은 이후 단계에서 재도입될 예정이며, 현재 구조는 `lib/rank/matchFlow`와 함께 작동합니다.【F:components/rank/StartClient/index.js†L1-L188】【F:lib/rank/matchFlow.js†L1-L135】
- **공용 채팅 페이지** – `/chat` 경로는 Supabase RPC로 불러온 최근 메시지를 보여주고 Postgres Realtime 구독으로 새 글을 반영합니다. 매칭/랭크 허브 상단 버튼과 동일한 페이지로 이동합니다.【F:pages/chat/index.js†L1-L240】
- **메이커 편집기** – `MakerEditor`는 React Flow 기반 노드/엣지 편집, 패널 탭, 변수 서랍을 `useMakerEditor` 훅과 하위 컴포넌트로 분리해 시각 편집과 저장/불러오기를 조율합니다.【F:components/maker/editor/MakerEditor.js†L1-L162】
- **Supabase 스키마 스크립트** – `supabase.sql`은 영웅/프롬프트/랭킹 테이블과 RLS, 스토리지 정책, `rank_heroes` 뷰 등을 한 번에 재생성할 수 있게 정의돼 있어 환경 초기화 시 실행하면 됩니다.【F:supabase.sql†L1-L200】

---
Generated: 2025-09-19T17:54:31.829473
<!-- -->
