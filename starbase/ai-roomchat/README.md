# ai-roomchat (Pages Router + JS, minimal)

**코드는 0, Supabase만 남았다** 가정으로 최소 재구축용 스타터.
- Pages Router + JavaScript (TS/앱 라우터 관련 에러 회피)
- 로그인(OAuth), 히어로 생성/조회, 공개 채팅(옵션)

## 0) 환경변수
`.env.example` 참고해서 `.env.local` 작성
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

---
Generated: 2025-09-19T17:54:31.829473
