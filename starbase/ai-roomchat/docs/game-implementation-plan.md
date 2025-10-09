# 게임 구현 계획: 프롬프트 제작기 & 등록 탭 정리

## 1. 분석 요약
- **프롬프트 제작기 홈**은 `useMakerHome` 훅을 통해 세트 목록을 불러오고, 새로고침/생성/가져오기/내보내기/삭제/이름 변경을 모두 지원하는 컨테이너-프리젠터 구조를 사용한다.
- **등록 탭(`RankNewClient`)**은 게임 메타데이터 입력, 역할·슬롯 구성, 규칙 체크리스트, 난입 모드 토글, 이미지 업로드 등 한 화면에서 게임 등록 과정을 마칠 수 있도록 구성돼 있다.

## 2. 페이지별 유지 요소와 정리 대상

### 2.1 프롬프트 제작기
**유지해야 할 흐름**
- 세트 목록 컨테이너(`MakerHomeContainer`)는 권한 미보유 시 `router.replace('/')`로 리다이렉트하고, 로컬 스토리지의 `selectedHeroBackgroundUrl`을 읽어 배경을 구성한다. 이 온보딩 경험은 허브와 일관성을 주므로 유지.【F:components/maker/home/MakerHomeContainer.js†L10-L78】
- 목록 헤더는 `useMakerHome` 훅이 내려주는 `rows`/`loading` 값에 따라 안내 문구를 동적으로 보여주고, `QuickActionsSheet`로 새 세트 생성·JSON 가져오기·새로고침을 제공해 제작자의 반복 루틴을 간결화한다. 이 컨테이너-프리젠터 흐름은 유지.【F:components/maker/home/MakerHomeContainer.js†L80-L140】【F:hooks/maker/useMakerHome.js†L34-L132】
- 에디터에서는 `useMakerEditor`가 그래프, 저장 히스토리, 버전 알림을 한 번에 관리한다. 핵심 행위(노드 추가, 저장, 변수 규칙 관리)는 룰 편집의 핵심이므로 동작 자체는 유지.【F:hooks/maker/useMakerEditor.js†L25-L138】

**정비/축소 후보**
- 홈 화면에 새로고침 역할이 `MakerHomeContainer`의 상단 버튼과 액션 시트의 `refresh()` 호출로 중복 구현되어 있다. 액션 시트를 입출력 전용(생성/가져오기/내보내기)으로 축소하고, 헤더에서만 `refresh`를 호출하게 정리한다.【F:components/maker/home/MakerHomeContainer.js†L115-L136】
- `useMakerEditor`가 그래프·선택·저장·히스토리·버전 경고를 한 훅에서 반환해 props 포화가 일어난다. 반환값을 `graph`, `persistence`, `uiState` 등 그룹으로 나누거나, `MakerEditorContext`를 도입해 하위 컴포넌트가 필요한 조각만 구독하도록 리팩터링한다.【F:hooks/maker/useMakerEditor.js†L58-L138】
- 자동 저장 히스토리(`saveHistory`)는 로컬 스토리지 키 `maker:history:${setId}`에 즉시 반영되지만, UI상 노출이 미미하다. 고급 기능 패널로 이동해 히스토리 내보내기/초기화 액션을 명시한다.【F:hooks/maker/useMakerEditor.js†L44-L95】

### 2.2 등록 탭
**유지해야 할 흐름**
- 배경은 로컬 스토리지에서 `selectedHeroBackgroundUrl`을 불러오고, `router.back()` 버튼으로 허브로 복귀한다. 허브 경험과 연결되는 요소이므로 유지.【F:components/rank/RankNewClient.js†L58-L108】【F:components/rank/RankNewClient.js†L273-L322】
- `RolesEditor`, `SlotMatrix`, `RulesChecklist`를 별도 카드로 렌더링하고, `REALTIME_MODES` 기반 모드 셀렉터·난입 토글 등 핵심 규칙 컨트롤이 단계별로 배치돼 있다. 이 편집 시퀀스는 유지.【F:components/rank/RankNewClient.js†L110-L458】
- 제출 시 `registerGame` → `rank_game_slots` `upsert` 순으로 처리하고 성공 후 `/rank/${gameId}`로 이동한다. 슬롯·역할 정합성을 보장하므로 흐름 유지.【F:components/rank/RankNewClient.js†L12-L207】【F:components/rank/RankNewClient.js†L208-L333】

**정비/축소 후보**
- 등록 안내 문구(`registerChecklist` 배열 등)는 컴포넌트 상수로 박혀 있다. 다국어 준비를 위해 JSON/MDX 구성으로 분리하고 `RulesChecklist`와 공유할 수 있도록 매핑한다.【F:components/rank/RankNewClient.js†L120-L166】【F:components/rank/RulesChecklist.js†L1-L120】
- 이미지 입력은 파일명만 보여주므로, `uploadGameImage` 호출 전 `URL.createObjectURL`로 미리보기를 제공하거나 기본 이미지 경고를 강화한다.【F:components/rank/RankNewClient.js†L317-L350】
- `registerGame`는 역할 이름 트리밍·점수 보정·슬롯 수 계산을 클라이언트에서 수행한다. `pages/api/rank/register-game.js`나 공유 유틸로 이동해 서버 검증을 공통화하면 등록/매칭 API 중복을 줄인다.【F:components/rank/RankNewClient.js†L12-L207】【F:pages/api/rank/register-game.js†L1-L94】

## 3. 구현 및 리팩터링 로드맵

### 3.1 1단계 – 데이터 구조 정비
- Maker 세트와 Rank 게임 등록이 공유하는 **배경/프롬프트 세트 식별자** 로컬 상태를 공통 스토리지 훅으로 추출한다.
- Supabase 호출 래퍼(`withTable`)와 등록 API를 서버-클라이언트 공용 유틸로 재구성해 에러 처리와 로깅을 일관화한다.
- 매칭 → 방 → 본게임 전환 시 공통으로 참조하는 **GameSession Store(가칭)**를 정의해 게임 ID, 슬롯/역할 매핑, 룸 생성 시각 등을 저장한다.

**코드 기준 세부 설계**
- `useMakerHome`은 `supabase.auth.getUser()` → `promptSetsRepository.list()` → `setRows` 순으로 동작한다. 동일 로직을 Rank 등록에서도 재사용할 수 있도록 `promptSet` 조회 훅을 공용화하고, `setErrorMessage` 흐름을 맞춘다.【F:hooks/maker/useMakerHome.js†L40-L133】
- Rank 등록의 `setId` 상태와 매칭 페이지의 `loadActiveRoles` 호출을 연결하기 위해, `PromptSetPicker` 선택값을 세션 스토리지에 캐시하고 Maker 홈에서 `importFromFile` 직후 동일 키에 쓰도록 통일한다.【F:components/rank/RankNewClient.js†L110-L208】【F:components/maker/home/MakerHomeContainer.js†L107-L167】
- 기존 `modules/rank/matchDataStore`는 매치 참가자·히어로 선택 상태를 세션에 저장한다. 여기에 `slotTemplate`(슬롯 번호·역할·버전) 필드를 추가해 매칭/방/본게임 흐름에서 GameSession Store의 최소 단위를 재사용한다.【F:modules/rank/matchDataStore.js†L1-L140】

#### 예상 문제 & 대응
- **스토리지 훅 동시 사용 시 레이스**: 비동기 초기화 과정에서 Maker/Rank가 서로 다른 세트 ID를 덮어쓸 수 있음 → 초기화 타임스탬프를 추적하고 최신 변경만 반영하도록 `compare-and-set` 패턴 적용.
- **Supabase 호출 실패 후 반복 재시도**: 동일 API를 여러 곳에서 호출할 경우 로깅이 중복될 수 있음 → API 유틸에 공통 retry/backoff 설정과 request ID 삽입.
- **GameSession Store 스키마 확장성**: 슬롯 커스터마이징이 늘어날 경우 키 폭주 → Store에 `version` 필드를 두고, 마이그레이션 함수로 스키마 변경 시 자동 변환.

### 3.2 2단계 – UI 모듈 재배치
- Maker 홈의 새로고침 버튼 위치를 조정하고, 시트와 상단 버튼이 다른 액션을 담당하도록 UX 재설계.
- 등록 탭의 안내 텍스트를 구성 객체 또는 MDX로 이동해 유지보수가 쉬운 콘텐츠 계층을 만든다.
- 에디터의 패널 상태, 자동 저장 기능을 `MakerEditorContext`(가칭)로 이동시켜 컴포넌트 간 의존성을 축소한다.
- 매칭 로비 UI에서 방 카드가 GameSession Store를 통해 현재 예약된 슬롯 수, 남은 슬롯, 역할 요약을 즉시 노출하도록 카드 컴포넌트를 재사용 가능한 상태로 분리한다.

**코드 기준 세부 설계**
- Maker 홈은 `setActionSheetOpen(false)` 호출로 시트를 닫는다. 이 액션에 `refresh()`가 묶여 있으므로, 시트 옵션을 `create/import/export`만 담당하게 하고 상단 `onRefresh` 버튼이 `setErrorMessage('')` → `refresh()`를 담당하도록 정리한다.【F:components/maker/home/MakerHomeContainer.js†L107-L145】
- 등록 탭의 `registerChecklist`·난입 설명 문자열을 `data/registrationGuides.js`(신규)로 분리하고, `RulesChecklist`의 체크 항목과 동일한 키를 사용하면 `buildRulesPrefix` 생성 규칙과도 싱크를 맞출 수 있다.【F:components/rank/RankNewClient.js†L120-L215】【F:components/rank/RulesChecklist.js†L36-L101】
- `useMakerEditor`의 `saveHistory`/`setSaveHistory`와 그래프 제어(`onNodesChange`, `appendTokenToSelected` 등)를 각각 컨텍스트로 분해하고, `MakerEditor` 루트에서 `<HistoryProvider>`와 `<GraphProvider>`를 감싸 props 전달을 줄인다.【F:hooks/maker/useMakerEditor.js†L58-L211】【F:components/maker/editor/MakerEditor.js†L1-L162】
- 매칭 로비(`pages/rooms/index.js`)는 `normalizeRealtimeMode`·`resolveMatchReadyMode` 흐름에서 슬롯 상태를 계산한다. GameSession Store 확장 시, `matchDataStore`가 보관하는 `matchSnapshot`에 `slotTemplate`을 주입하고 로비 카드가 `setGameMatchSnapshot` 결과를 읽도록 수정한다.【F:pages/rooms/index.js†L1340-L1768】【F:modules/rank/matchDataStore.js†L97-L176】

#### 예상 문제 & 대응
- **UX 재배치 시 사용성 저하 우려**: 기존 제작자들이 익숙한 위치가 바뀔 수 있음 → 피처 플래그로 신 UI를 제한 공개하고, 유저 피드백을 수집해 단계적 롤아웃.
- **MDX/구성 객체 분리 시 번들 크기 증가**: 정적 콘텐츠가 번들에 포함되면 초기 로딩이 느려질 수 있음 → `dynamic import`와 정적 JSON fetch를 혼합해 최초 진입 시 최소 데이터만 로딩.
- **Context 분리 후 Prop Drilling 재발**: 하위 컴포넌트가 새 컨텍스트에 즉시 적응하지 못할 수 있음 → 컴포넌트별 adapter 훅을 정의해 기존 props 계약을 유지하면서 내부적으로 컨텍스트를 사용.

### 3.3 3단계 – 확장 기능 및 검증
- 게임 등록 시 이미지 미리보기, 규칙 토글과 `RulesChecklist` 간의 상호 검증(예: 난입 허용 시 종료 변수 필수)을 추가한다.
- Maker JSON 가져오기 시 스키마 버전 확인 로직을 추가하고, 호환되지 않는 경우 업그레이드 안내 배너를 띄운다.
- 등록 완료 후 곧바로 테스트 전투를 시작할 수 있는 CTA(예: “매치 시뮬레이터 열기”)를 Rank 허브와 연동한다.
- 룸 생성 시 `RoleSlotMatrix` 데이터를 캐시하고, 플레이어 매칭 단계에서 슬롯이 점유될 때마다 상태를 업데이트하여 메인 게임 진입 시 자동으로 역할별 초기화 데이터를 주입한다.

**코드 기준 세부 설계**
- 난입 허용 시 `endCondition`이 비어 있으면 `registerGame` 호출 전에 `alert`이 발생하도록 클라이언트 검증을 추가하고, 서버에서는 `pages/api/rank/register-game.js`에서 동일 필수 검증을 재사용한다.【F:components/rank/RankNewClient.js†L166-L248】【F:pages/api/rank/register-game.js†L45-L94】
- Maker JSON 업로드는 `insertPromptSetBundle` 호출 후 바로 `refresh()`를 실행한다. 이 과정에 `payload.meta?.version` 체크를 추가하고, `useMakerEditor`의 `VARIABLE_RULES_VERSION`과 비교해 업그레이드 안내 배너를 띄운다.【F:hooks/maker/useMakerHome.js†L95-L133】【F:hooks/maker/useMakerEditor.js†L24-L70】
- 룸 생성 API(`/api/rank/match`)는 현재 슬롯 정보를 `rank_match_roster`에 스테이징한다. GameSession Store를 확장하면 `stage-room-match` 호출 전에 `matchDataStore.setGameMatchSnapshot`에 슬롯 버전을 씌워, 본게임 페이지(`/rooms/[id].js`)가 동일 데이터를 읽어 초기화한다.【F:pages/api/rank/match.js†L147-L419】【F:pages/rooms/[id].js†L287-L2136】【F:modules/rank/matchDataStore.js†L124-L204】

#### 예상 문제 & 대응
- **이미지 업로드 용량 초과/실패**: 사용자마다 업로드 환경이 다름 → 업로드 전 클라이언트에서 용량·확장자 검증, 실패 시 재업로드 힌트 제공, 서버에는 업로드 한도 초과 로그 추가.
- **규칙 상호 검증 충돌**: 조건이 복잡해질수록 경고가 남발될 수 있음 → 검증 로직을 스키마 기반으로 구성하고, 경고 우선순위를 조정해 한 번에 한 오류만 노출.
- **JSON 스키마 버전 불일치**: 구버전 파일이 업로드될 수 있음 → 마이그레이션 단계를 UI로 노출하고, 자동 변환 실패 시 디프 비교와 가이드 제공.
- **테스트 전투 CTA 남용**: 테스트 방이 다수 생성되면 리소스 낭비 → CTA 실행 시 자동 삭제 타이머와 사용량 제한 설정.

### 3.4 4단계 – 테스트 전략
- Maker/Rank 공통 훅에 대한 단위 테스트를 추가해 로컬 스토리지 파싱, Supabase 응답 에러 케이스를 검증한다.
- 등록 폼 통합 테스트: 역할 슬롯 누락, 이미지 업로드 실패, 난입 조건 미입력 시 경고 등 주요 분기 검증.
- JSON Import/Export E2E: 제작기가 올바른 노드/엣지 구조를 재현하는지 Playwright 시나리오로 확인.

**코드 기준 세부 설계**
- `useMakerHome`의 `hydrate`/`refresh`는 Supabase 인증 실패 시 빈 배열을 리턴한다. Jest에서 `supabase.auth.getUser`와 `promptSetsRepository.list`를 모킹해 에러 분기를 검증한다.【F:hooks/maker/useMakerHome.js†L48-L133】
- Rank 등록 E2E는 `SlotMatrix`에서 12칸 기본 슬롯을 가진 상태를 전제한다. Playwright 테스트에서 `data-testid` 속성을 추가해 슬롯 토글/역할 선택을 안정적으로 제어한다.【F:components/rank/SlotMatrix.js†L1-L88】
- GameSession Store 통합 테스트는 `matchDataStore` 확장 시 `setGameMatchParticipation`·`setGameMatchSnapshot`가 버전 정보를 유지하는지 확인하고, `sessionStorage` 모킹으로 `persistToSession` 호출을 검증한다.【F:modules/rank/matchDataStore.js†L1-L176】

#### 예상 문제 & 대응
- **테스트 환경에서 로컬 스토리지 모킹 누락**: 브라우저/Node 환경 차이로 실패 가능 → Jest setup에 공통 storage mock 추가, Playwright는 `storageState` fixture로 초기 상태 유지.
- **Supabase 의존 테스트 불안정**: 네트워크 불안으로 flake 발생 → Supabase 호출을 테스트 더블로 대체하고, E2E는 전용 테스트 프로젝트/테이블 사용.
- **Playwright CI 실행 시간 증가**: E2E 시나리오가 늘어나면 10분 이상 소요될 수 있음 → 시나리오를 태그로 그룹화하고, PR에서는 핵심 시나리오만 실행하도록 워크플로 조정.

### 3.5 구현 계획 보강 요약
- 프론트 훅/컴포넌트별로 확인한 상태명과 스토리지 키를 토대로, 중복 새로고침/메시지 처리·히스토리 저장·슬롯 매핑 구조 개선을 명확히 정의했다.【F:components/maker/home/MakerHomeContainer.js†L80-L167】【F:hooks/maker/useMakerEditor.js†L24-L138】【F:components/rank/RankNewClient.js†L110-L333】
- `matchDataStore`를 GameSession Store의 출발점으로 잡아, 매칭→방→본게임 데이터 전달에 필요한 `slotTemplate`·버전 필드 추가를 계획했다.【F:modules/rank/matchDataStore.js†L1-L176】【F:pages/rooms/index.js†L1340-L1768】【F:pages/rooms/[id].js†L287-L2136】
- Rank 등록, Maker 편집기, 매칭 API가 공유해야 할 검증/스토리지/문자열 자산을 추출해 다국어/버전 관리 대비를 구체화했다.【F:components/rank/RankNewClient.js†L120-L350】【F:components/rank/RulesChecklist.js†L36-L101】【F:pages/api/rank/register-game.js†L45-L94】

## 4. 예상 산출물 & 후속 과제
- 통합 배경/세트 스토리지 훅, Supabase 유틸 리팩터링 PR
- Maker 홈/에디터 UI 정돈 및 고급 기능 패널화 PR
- 등록 탭 안내 콘텐츠 분리 및 규칙 검증 보강 PR
- 테스트 보강과 CI 파이프라인 알림 정비 PR
- GameSession Store 버전 관리 및 마이그레이션 가이드 문서화

## 5. 매칭 → 방 → 본게임 흐름 계획
- **매칭 페이지**: 선택한 게임 ID를 기준으로 GameSession Store를 초기화하고, Supabase에서 슬롯/역할 배치 데이터를 사전 로딩한다. 플레이어가 특정 방을 선택할 때 잔여 슬롯, 권장 역할, 준비 여부를 보여주는 `MatchRoomSummary` 컴포넌트를 제공한다.
- **방 생성 단계**: 방을 만들 때 `RoomInitService`가 슬롯과 역할 데이터를 가져와 각 슬롯에 대한 고유 식별자(슬롯 번호, 역할 태그, 인원 제한)를 생성한다. 호스트는 이 데이터를 기반으로 슬롯별 설명을 수정하고, 변경 사항은 GameSession Store와 Supabase 방 레코드에 동시에 반영한다.
- **방 입장/검색 단계**: 플레이어가 방을 검색해 입장할 때 `SlotAssignmentFlow`가 가용 슬롯을 탐색하고, 선택 즉시 해당 슬롯 번호와 역할 정보를 GameSession Store에 바인딩한다. 중복 할당 방지를 위해 Optimistic Lock + Supabase RPC를 활용한다.
- **본게임 진입**: 시작 버튼을 누르면 GameSession Store의 최종 슬롯 매핑을 검증하고, 메인 게임 페이지로 전환하면서 역할별 초기 데이터(예: 시작 프롬프트, 스킬 쿨다운)를 주입한다. 본게임에서는 Store를 읽기 전용으로 전환해 상태 일관성을 유지한다.

### 예상 문제 & 대응
- **슬롯 데이터 동시 갱신 충돌**: 방 호스트와 참가자가 동시에 슬롯을 수정할 경우 데이터 경합 가능 → 슬롯 레코드에 버전 필드와 Supabase Row Level Security를 활용해 낙관적 잠금 구현.
- **방 검색 성능 저하**: 실시간 방 수가 늘어나면 쿼리 비용 증가 → 실시간 채널을 이용해 변경 사항만 스트리밍하고, 클라이언트는 캐싱된 리스트에 패치 적용.
- **본게임 진입 전 검증 실패**: Store와 Supabase 상태가 불일치할 수 있음 → 진입 전 서버 측 `validate_session` RPC 호출로 슬롯-역할 매핑을 재검증하고, 실패 시 자동 롤백/재동기화 UI 제공.

---
**백엔드 TODO**: Supabase 역할/슬롯 검증 함수 공통화, RoomInitService용 슬롯/역할 캐시 테이블 및 락 RPC 추가, `validate_session` RPC 및 슬롯 버전 필드 도입, 이미지 업로드 정책(용량/파일형식) 강화, 등록/매칭 로그 감사 테이블 확장.
**추가 필요 사항**: 다국어 대비 문자열 리소스 분리, 매칭/룸 UI 카피 검수, GameSession Store 스키마 및 Maker JSON 버전 문서화, 테스트 환경용 Supabase 프로젝트 분리.
**진행 상황**: 구현 계획 고도화 및 리스크 대응 전략 문서화 완료 (문서 업데이트).
