# ChatGPT Web Automation Notes

목적

- API 비용을 줄이기 위한 보조 경로로, 로그인된 `chatgpt.com` 세션을 개발용으로 자동 조작한다.
- 정식 API 대체가 아니라, 선택적으로 쓰는 실험/보조 기능으로 유지한다.

현재 스크립트

- 실행 파일: `scripts/run-chatgpt-web-prompt.js`
- npm 스크립트: `npm run chatgpt:web -- ...`

현재 동작 순서

1. 지속 Chromium 프로필로 브라우저를 연다.
2. `chatgpt.com`에 접속하고 로그인된 composer를 찾는다.
3. 새 채팅을 시작한다.
4. 프롬프트를 입력하고 전송한다.
5. 마지막 assistant 응답이 멈출 때까지 기다린다.
6. 마지막 assistant 메시지의 fenced code block을 추출한다.
7. `--expect json`이면 첫 code block을 JSON으로 파싱한다.
8. 가능하면 방금 만든 채팅을 삭제한다.

주의점

- ChatGPT 웹 DOM/aria label 변경에 매우 취약하다.
- 로그인은 첫 실행 시 수동 개입이 필요할 수 있다.
- 채팅 삭제는 best-effort이며 실패할 수 있다.
- 운영 핵심 경로가 아니라, dev/ops 보조 기능으로만 본다.

차후 업데이트 포인트

- 새 채팅 버튼 셀렉터
- 입력창 셀렉터
- 전송 버튼 셀렉터
- 응답 완료 판정 로직
- 채팅 삭제 메뉴 셀렉터
- 추출 규칙을 첫 code block 외 다중 block/markdown fallback까지 확장

향후 연결 예정

- 수동/자동 생성 선택 UI
- 생성 결과를 우리 DB 저장 API와 연결
- 실패 시 재시도/수동 붙여넣기 fallback

# Image Upload / Delete Flow Notes

컷아웃 생성

- API: `pages/api/hero-assets/generate-cutout.js`
- 입력: base64 image
- 출력: PNG base64 + `stats.transparentPixels`

등록(create) 흐름

- 진입점: `components/create/useHeroCreator.js`
- 일반 캐릭터 이미지:
  - `uploadHeroImageBundle()` 호출
  - 원본 업로드 성공 후 컷아웃 생성/업로드
  - 컷아웃 실패 시 원본 업로드를 `/api/storage/delete`로 롤백 시도
- 배경/BGM/포켓로그 전후면/아이콘:
  - 각각 `uploadAsset()`으로 개별 업로드
- 생성 단계에서는 부분 업로드 성공 후 DB insert 실패 시 전체 업로드 롤백이 없다.

편집(edit) 흐름

- 진입점: `components/character/CharacterBasicView.js`
- 새 이미지 업로드 성공 후 DB update 성공 시:
  - 이전 `image_url`
  - 이전 `ingame_image_url`
  - 이전 포켓로그 front/back/icon URL
  를 `/api/storage/delete`로 best-effort 정리한다.
- `pokerogue_enabled`를 끄면 기존 포켓로그 스프라이트 URL 3개 삭제를 시도한다.

현재 한계

- create 쪽은 DB insert가 마지막에 실패해도 이미 올라간 배경/BGM/포켓로그 스프라이트가 남을 수 있다.
- edit 쪽 cleanup은 `await`하지 않고 best-effort로 던지므로 실패를 사용자에게 알리지 않는다.
- preview 실패는 콘솔 로그만 남기고 UI에서 상세 원인을 충분히 보여주지 않는다.

다음 개선 후보

1. create 단계 업로드 URL들을 수집해서 insert 실패 시 일괄 rollback
2. edit 단계 cleanup 결과를 `Promise.allSettled`로 모아 기록
3. 컷아웃 응답 `transparentPixels`를 UI debug badge로 표시
4. ChatGPT 웹 보조 생성 결과와 이미지 업로드 결과를 같은 dev console panel에서 볼 수 있게 통합
# Local helper bridge

- production serverless route is intentionally disabled
- recommended dev flow is a localhost helper on `http://127.0.0.1:4319`
- start it with `npm run chatgpt:web:bridge`
- tool page can switch between local helper and server api
