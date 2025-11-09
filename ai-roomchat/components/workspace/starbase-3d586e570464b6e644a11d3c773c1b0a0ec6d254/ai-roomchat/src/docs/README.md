# 게임 플러그인 개발(에디터 전용 요약)

목표: 에디터 파일트리에서 바로 읽고, 바로 실행.

핵심 파일
- `src/game/index.js` — 유저 게임 어댑터 엔트리(수정 포인트)
- `../components/game/PlayScaffold.jsx` — 테스트용 플레이 스캐폴드
- 실행 경로: `/game/play-ai/dev`

반드시 읽기(상세 가이드)
- `../../docs/PLUGIN_HOST.md`
- `../../docs/GAME_ADAPTERS.md`
- `../../docs/NETWORK_ADAPTERS.md`
- `../../docs/AI_ORCHESTRATION.md`
- `../../docs/IN_GAME_CHAT.md`
- `../../docs/CHARACTER_DATA.md`
- `../../docs/MOBILE_CONTROLS.md`
- `../../docs/STATE_AND_TURNS.md`
- `../../docs/TEXT_GAME_ENGINE.md`
- `../../docs/GENRE_STARTERS.md`

레퍼런스 데이터
- HTTP 경로: `/api/reference/*` (로컬에서 `ai-roomchat/docs/reference_data`를 읽음)
- 키 로더: `../lib/game/reference/referenceData.js`

빠른 시작
1) `src/game/index.js`에서 캔버스 루프/입력 처리 확인 후 저장
2) 브라우저에서 `/game/play-ai/dev` 열기 → 예제 렌더 확인
3) 필요 시 `InGameChatOverlay`(ai/party)로 세션 채팅 확인
4) 템플릿/오케스트레이션은 `AI_ORCHESTRATION.md` 참고

주의
- API 키/비밀은 클라이언트에 두지 말고 `/pages/api/*` 프록시에서 사용
- 네트워크/프로토콜은 `NETWORK_ADAPTERS.md` 규약에 맞춰 얇게 연결
