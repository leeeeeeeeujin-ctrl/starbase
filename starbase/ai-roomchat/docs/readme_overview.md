# README 개요

`README.md` 파일은 Supabase 기반의 AI 캐릭터 생성·채팅 웹앱 스타터를 어떻게 설정하고 사용하는지 설명하는 안내서입니다. 핵심 내용은 다음과 같습니다.

- **환경 변수 구성**: `.env.example`을 기반으로 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등을 정의해 로컬 개발 환경을 준비합니다.
- **설치 및 실행 방법**: `npm install` 후 `npm run dev`로 개발 서버를 구동하고 `http://localhost:3000`에서 앱을 확인합니다.
- **Supabase 초기화 절차**: Google OAuth 리디렉션 주소 설정, `supabase.sql`과 `supabase_chat.sql` 스크립트 실행, `heroes` 스토리지 버킷 생성, Realtime 테이블 활성화 과정을 순서대로 안내합니다.
- **주요 라우트 설명**: 홈(`/`), OAuth 콜백(`/auth-callback`), 캐릭터 생성(`/create`), 캐릭터 목록(`/roster`), 공개 채팅(`/chat`) 등 페이지 역할을 요약합니다.
- **구조 메모 하이라이트**: `lib/supabaseTables.js`의 자동 테이블 매핑, `components/rank/StartClient`의 랭킹 전투 클라이언트, `components/common/SharedChatDock`의 공용 채팅 도크, `components/maker/editor/MakerEditor`의 노드 기반 편집기, `supabase.sql`의 스키마 스크립트를 간단히 정리합니다.

프로젝트 전반을 빠르게 파악하려면 `README.md`와 함께 언급된 모듈을 살펴보는 것이 좋습니다.
