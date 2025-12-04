# Starbase Hub API (draft)

목표
- 웹앱(ai-roomchat)에서 로컬/외부 Hub 플러그인을 JSON API로 호출해 UI 테스트, 로컬 Git, Supabase 연계 등을 제공.
- 워크스페이스 VFS 경계는 웹앱이 유지하고, Hub는 별도 권한/프로세스에서 동작.

기본 원칙
- 인증: Bearer 토큰(환경/설정), 필요시 Origin/Host 제한.
- 전송: HTTP/WS JSON. 오류는 `{ ok:false, error:string, detail? }`.
- 헬스: `GET /health` → `{ ok:true, status:'ready', plugins:[id] }`.
- 플러그인 등록: Hub 시작 시 `plugins: [{ id, title, actions: [string], configSchema? }]` 노출.

엔드포인트 제안
- `GET /health` — 헬스 체크, 지원 플러그인 목록.
- `POST /plugin/:id/action` — 플러그인 액션 실행:
  - Body: `{ action: string, payload?: object }`
  - 응답: `{ ok, result?, error?, detail? }`
- (선택) `POST /session` / `POST /session/:id/step` — UI 테스트 샌드박스형 플러그인용 세션 API.

인증/권한 모델(초안)
- 요청 헤더: `Authorization: Bearer <token>` — 로컬 설치 시 설치 마법사/설정 UI에서 발급·저장. 토큰이 없으면 기본 deny.
- 토큰 스코프(예시): `ui.test`, `git.local`, `files.read`, `files.write`. 플러그인은 필요한 스코프 목록을 노출하고, Hub는 토큰 스코프에 포함된 액션만 허용.
- 원점 제한: Hub 설정에서 `allowed_origins` (예: `http://localhost:3000`)를 지정, CORS/Origin 체크.
- 경로/명령 제한: 플러그인별로 허용된 cwd/명령 프리픽스/정규식을 설정하고, 요청 payload가 이를 벗어나면 거부.
- 롤(선택): `role: admin|user|readonly` 같은 단순 롤을 토큰 메타에 포함해 위험한 액션(예: git push)을 추가로 제한.

UI 테스트 플러그인 예시(`id: ui-sandbox`)
- Actions: `session:create`, `session:step`, `session:state`, `session:close`.
- 세션 생성: `POST /plugin/ui-sandbox/action { action:'session:create', payload:{ browser:'chromium' } }` → `{ ok, result:{ sessionId } }`
- 스텝 실행: `action:'session:step'` payload `{ sessionId, step:{ action:'click'|'type'|'navigate'|... , params } }`
- 상태 조회: `action:'session:state'` payload `{ sessionId }` → `{ ok, result:{ logs, domSummary, screenshotId? } }`

로컬 Git 플러그인 예시(`id: git-local`)
- Actions: `status`, `commit`, `push`, `pull`.
- `POST /plugin/git-local/action { action:'status', payload:{ cwd } }` → git status 결과.
- 주의: Hub 설정에서 허용된 작업 디렉터리만 허용.

보안 메모
- Hub는 브라우저/웹앱과 분리된 프로세스로 실행, 기본적으로 localhost/로컬 네트워크만 허용.
- 플러그인별 허용 경로/명령은 Hub 측 설정으로 제한.
- 모든 응답에 ok/error를 명시, 타임아웃 필수.
- 토큰 발급/회수 절차 명시: 로컬 설치 UI에서 토큰 생성 → 브라우저/웹앱 환경변수에 저장 → 회수 시 즉시 차단. (CI/배포 시에는 별도 키 주입 금지.)

향후
- WS 이벤트 스트림(로그/상태 push) 추가
- 플러그인 설치/업데이트/권한 UI 초안
