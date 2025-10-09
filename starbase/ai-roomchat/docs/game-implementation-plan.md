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

#### 2.1 단계별 실행 계획 (2-1)
| 상태 | 태스크 | 세부 내용 | 참고 코드 |
| --- | --- | --- | --- |
| ☑ | QuickActionsSheet 재구성 | `QuickActionsSheet`에서 `refresh` 호출을 제거하고 `MakerHomeContainer` 상단 버튼에만 배치. 액션 시트는 생성/가져오기/내보내기만 담당하도록 props 재정의.【F:components/maker/home/MakerHomeContainer.js†L80-L167】【F:components/maker/home/QuickActionsSheet.js†L1-L120】 | `components/maker/home/MakerHomeContainer.js`, `components/maker/home/QuickActionsSheet.js` |
| ☑ | MakerEditor 상태 분리 | `useMakerEditor` 반환값을 `status`·`graph`·`selection`·`variables`·`history` 그룹으로 재구성해 `MakerEditor`가 필요한 조각만 구독하도록 정리하고, 패널·알림 전달 props를 축소했다.【F:hooks/maker/useMakerEditor.js†L24-L274】【F:components/maker/editor/MakerEditor.js†L1-L220】 | `hooks/maker/useMakerEditor.js`, `components/maker/editor/MakerEditor.js` |
| ☑ | 히스토리 패널 이동 | `saveHistory` UI를 고급 패널(예: `<AdvancedToolsPanel>`)로 이동. 히스토리 내보내기/초기화 버튼에 `maker:history:${setId}` 키를 노출하고, `useLocalStorage` 훅을 재사용해 접근성을 통일.【F:components/maker/editor/AdvancedToolsPanel.js†L1-L173】 | `components/maker/editor/AdvancedToolsPanel.js`(신규), `hooks/maker/useMakerEditor.js` |
| ☑ | 공용 PromptSet 스토리지 훅 | Maker 홈과 Rank 등록에서 공유하는 `selectedHeroBackgroundUrl`·`promptSetId`를 `useSharedPromptSetStorage`(가칭)로 추출. 초기화 타임스탬프를 저장해 최신 값만 반영.【F:hooks/shared/useSharedPromptSetStorage.js†L1-L172】 | `hooks/shared/useSharedPromptSetStorage.js`(신규), `hooks/maker/useMakerHome.js`, `components/rank/RankNewClient.js` |

#### 2.1 예상 리스크 & 대응
- **컨텍스트 도입 시 렌더 폭증**: 컨텍스트 분리 후 공급자가 여러 번 리렌더링될 수 있다 → `React.memo`와 `useMemo`로 컨텍스트 값 래핑, 그래프 이벤트 핸들러는 `useCallback` 유지.
- **스토리지 동기화 충돌**: Maker와 Rank에서 동시에 스토리지를 갱신하면 값이 덮어써질 수 있다 → `useSharedPromptSetStorage`에 업데이트 시퀀스 넘버를 저장하고 최신 타임스탬프만 반영.
- **히스토리 패널 가시성 하락**: 고급 패널 이동 후 사용자 접근성이 떨어질 수 있다 → `AdvancedToolsPanel`에 온보딩 툴팁을 추가하고, 최근 저장 시 알림 배지 제공.

### 2.2 등록 탭
**유지해야 할 흐름**
- 배경은 로컬 스토리지에서 `selectedHeroBackgroundUrl`을 불러오고, `router.back()` 버튼으로 허브로 복귀한다. 허브 경험과 연결되는 요소이므로 유지.【F:components/rank/RankNewClient.js†L58-L108】【F:components/rank/RankNewClient.js†L273-L322】
- `RolesEditor`, `SlotMatrix`, `RulesChecklist`를 별도 카드로 렌더링하고, `REALTIME_MODES` 기반 모드 셀렉터·난입 토글 등 핵심 규칙 컨트롤이 단계별로 배치돼 있다. 이 편집 시퀀스는 유지.【F:components/rank/RankNewClient.js†L110-L458】
- 제출 시 `registerGame` → `rank_game_slots` `upsert` 순으로 처리하고 성공 후 `/rank/${gameId}`로 이동한다. 슬롯·역할 정합성을 보장하므로 흐름 유지.【F:components/rank/RankNewClient.js†L12-L207】【F:components/rank/RankNewClient.js†L208-L333】

**진행 현황**
- 등록 폼은 `registerGame`이 인증 상태 검증, 역할 중복 제거, 점수 범위 보정까지 담당하면서 슬롯 업서트와 리다이렉트가 이어지도록 구성되어 있어 1차 동작 완성도를 갖췄다.【F:components/rank/RankNewClient.js†L12-L207】【F:components/rank/RankNewClient.js†L208-L333】
- UI는 RolesEditor·SlotMatrix·RulesChecklist 카드가 모두 활성화되어 있고, 난입 토글과 실시간 모드 선택이 카드 단위로 묶여 있어 핵심 편집 시퀀스가 이미 운영 중이다.【F:components/rank/RankNewClient.js†L271-L458】
- 레이아웃을 `RegistrationLayout`·`RegistrationCard`·`SidebarCard` 컴포넌트로 분리해 개요/사이드 가이드를 별도 칼럼으로 고정하고, 기본 정보·모드·역할·슬롯·규칙을 카드 기반으로 재배치했다.【F:components/rank/RankNewClient.js†L335-L512】【F:components/rank/registration/RegistrationLayout.js†L1-L83】【F:components/rank/registration/RegistrationCard.js†L1-L42】
- 표지 이미지 입력에 3MB 용량 검증과 미리보기·제거 컨트롤을 추가해 업로드 전 품질을 확인할 수 있도록 했다.【F:components/rank/RankNewClient.js†L180-L258】【F:data/rankRegistrationContent.js†L28-L36】
- 난입 허용 시 종료 변수 필드를 비워둘 수 없도록 클라이언트 검증을 추가해 규칙 누락을 방지한다.【F:components/rank/RankNewClient.js†L235-L257】
- JSON 가져오기 시 변수 규칙 버전 정보를 확인하고, 구버전/미표기 세트에는 재저장을 안내하는 공지 메시지를 노출하도록 제작기 홈을 보강했다.【F:hooks/maker/useMakerHome.js†L12-L163】【F:components/maker/home/MakerHomeHeader.js†L1-L60】

**정비/축소 후보**
- (완료) 등록 안내 문구와 난입 설명을 `rankRegistrationContent` 데이터로 추출했다. 이후 다국어 리소스를 연결할 때 해당 데이터 객체를 번들 경량화를 위해 동적 임포트하도록 보완한다.【F:ai-roomchat/data/rankRegistrationContent.js†L1-L60】
- (완료) 이미지 입력은 파일명만 보여주던 문제를 3MB 이하 이미지 검사와 미리보기 카드로 교체했다.【F:components/rank/RankNewClient.js†L180-L258】【F:data/rankRegistrationContent.js†L28-L36】
- `registerGame`는 역할 이름 트리밍·점수 보정·슬롯 수 계산을 클라이언트에서 수행한다. `pages/api/rank/register-game.js`나 공유 유틸로 이동해 서버 검증을 공통화하면 등록/매칭 API 중복을 줄인다.【F:components/rank/RankNewClient.js†L12-L207】【F:pages/api/rank/register-game.js†L1-L94】

### 2.3 방 찾기(로비)
**유지해야 할 흐름**
- 로비 상단은 모드/점수 필터와 `ROOM_BROWSER_AUTO_REFRESH_INTERVAL_MS` 기반 자동 새로 고침으로 방 목록을 최신 상태로 유지한다. 이 타이머는 목록 갱신과 사용자 안내 패턴을 유지하기 위해 필요하다.【F:pages/rooms/index.js†L31-L115】
- 뷰어의 영웅/유저 정보를 Supabase 세션, `selectedHeroStorage`, `rankAuthStorage`를 조합해 정합성 있게 불러오고 캐시한다. 로컬 스토리지 간 충돌 시 클린업 후 재동기화하는 흐름은 로비와 다른 페이지가 공유하는 상태 일관성을 담보하므로 유지한다.【F:pages/rooms/index.js†L944-L1158】
- 영웅 참여 내역을 `fetchHeroParticipationBundle`로 불러와 등록된 게임별 히스토리/점수를 구성하고, 참가 기록 중복을 제거한 뒤 필터링 옵션으로 재사용한다. 방 생성 시점에 바로 노출되는 맥락 정보로 활용되므로 흐름 유지가 필요하다.【F:pages/rooms/index.js†L1088-L1167】
- 실시간 슬롯 변동을 반영하기 위해 5초 간격 폴링과 Supabase 실시간 채널을 병행하여 방 목록을 동기화한다. 이는 참가자 충돌 감지와 방 상태 지표를 신속히 갱신하기 위한 핵심이다.【F:pages/rooms/index.js†L1406-L1467】

**진행 현황**
- 로비는 현재 폴링과 실시간 채널을 동시에 사용해 기본 동기화 루프가 작동 중이며, 단일 파일이지만 방 생성/입장 정보를 즉시 반영한다.【F:pages/rooms/index.js†L31-L1467】
- `resolveViewerProfile`과 `rankAuthStorage` 연계로 영웅 선택·API 키 스냅샷이 읽히고 있어 GameSession Store 확장 시 활용 가능한 세션 데이터 축적이 이미 이루어지고 있다.【F:pages/rooms/index.js†L944-L1158】【F:modules/rank/matchDataStore.js†L1-L118】
- 필터/검색 결과 UI를 `RoomFiltersSection`과 `RoomResultsSection` 컴포넌트로 분리해 목록 카드·진단 메시지를 독립 렌더러로 관리하고, 페이지 본문은 상태 계산과 모달 제어에 집중하도록 정리했다.【F:components/rank/rooms/RoomFiltersSection.js†L1-L153】【F:components/rank/rooms/RoomResultsSection.js†L1-L153】
- 영웅 참여 데이터와 참가 게임 조회를 `Promise.allSettled`로 병렬 처리해 한쪽 호출이 실패해도 나머지 데이터가 유지되도록 했고, 실패 시 콘솔 경고로 추적 가능하게 했다.【F:pages/rooms/index.js†L1009-L1107】
- 검색 결과 섹션에 실시간 모니터링 배지와 자동 새로고침 카운트다운을 추가해 현재 새로고침 상태를 즉시 파악할 수 있다.【F:components/rank/rooms/RoomResultsSection.js†L1-L120】【F:components/rank/rooms/RoomResultsSection.js†L134-L180】

**정비/축소 후보**
- (완료) 뷰어 영웅/유저 정보를 해결하는 비동기 체인이 `resolveViewerProfile` → `fetchHeroParticipationBundle` → 상태 업데이트로 이어지는 동안 실패 시 콘솔 경고만 남던 문제를, 로비 상단 알림 카드와 재시도 버튼으로 보완해 즉시 복구 경로를 제공했다.【F:pages/rooms/index.js†L906-L1160】【F:components/rank/rooms/RoomResultsSection.js†L39-L112】
- (완료) 필터 패널과 검색 결과는 컴포넌트로 분리된 상태에서 실시간 상태 배지와 폴링 스피너를 `RoomRefreshIndicator` 공용 UI로 옮기고, 추가 알림도 동일한 스타일로 노출해 로비/향후 페이지가 동일한 상태 요약을 재사용할 수 있게 했다.【F:components/rank/rooms/RoomRefreshIndicator.js†L1-L63】【F:components/rank/rooms/RoomResultsSection.js†L90-L112】

### 2.4 방 상세/입장
**유지해야 할 흐름**
- `loadRoom`은 Supabase에서 방 메타, 슬롯, 활성 슬롯 템플릿, 호스트 레이팅까지 순차적으로 조회한 뒤 슬롯 점유율을 계산해 방 상태를 재평가한다. 슬롯 카운터와 상태를 즉시 갱신하는 로직은 참가자 수치 정확도를 위해 유지한다.【F:pages/rooms/[id].js†L1127-L1395】
- 방 상태는 수동 새로 고침, 30초 간격 폴링, `rank_room_slots` 실시간 구독을 결합해 갱신한다. 특히 슬롯 변경 이벤트에 120ms 디바운스를 적용해 과도한 API 호출을 줄이는 구조는 유지 가치가 있다.【F:pages/rooms/[id].js†L1400-L1468】
- 참가자 퇴장/방 삭제에 대비한 지연 클린업 타이머(`ROOM_EXIT_DELAY_MS`, `HOST_CLEANUP_DELAY_MS`)는 세션 종료 시 남은 슬롯을 정리하고 방 정리를 자동화하므로 유지한다.【F:pages/rooms/[id].js†L1525-L1660】
- 모든 슬롯이 준비 완료되면 `buildMatchTransferPayload`로 로스터/매치 메타를 조립하고 `stage-room-match` API를 호출한 뒤 GameSession Store(`matchDataStore`)에 참여자·스냅샷을 싱크한 후 `match-ready`로 전환한다. 이 시퀀스는 본게임 데이터 전달의 핵심이므로 구조를 유지하되 보강한다.【F:pages/rooms/[id].js†L1989-L2139】【F:pages/api/rank/stage-room-match.js†L215-L337】

**진행 현황**
- 방 상세 화면은 현재 게임 메타 → 슬롯 → 템플릿 → 호스트 레이팅 순으로 데이터를 채우고, 실시간 구독/폴링이 결합된 상태로 운영되어 기능적으로는 완주했다.【F:pages/rooms/[id].js†L1127-L1520】
- 매치 스테이징 이후 GameSession Store에 참여자/히어로/스냅샷이 저장되어 MatchReady 단계에서 바로 소비되고 있다.【F:pages/rooms/[id].js†L2025-L2134】【F:modules/rank/matchDataStore.js†L1-L118】

**정비/축소 후보**
- `loadRoom` 내부에서 슬롯 활성화 필터링, 히어로 이름 조회, 호스트 레이팅 계산까지 처리해 함수가 비대하다. 슬롯·히어로·참가자 조회를 유틸로 분리하고, 실패 시 부분 데이터를 표시할 수 있도록 UI 계층을 분리한다.【F:pages/rooms/[id].js†L1127-L1395】
- `stage-room-match`는 이제 `sync_rank_match_roster` RPC를 호출해 슬롯 버전 충돌을 검사한 뒤 한 번의 RPC로 삽입을 수행한다. 추후에는 차등 업데이트를 검토하지만, 현재는 Supabase 함수에서 버전 비교·트랜잭션을 책임져 데이터 손실 위험을 줄였다.【F:pages/api/rank/stage-room-match.js†L215-L306】【F:docs/sql/sync-rank-match-roster.sql†L1-L112】

### 2.5 메인 게임 준비 & 실행
**유지해야 할 흐름**
- `readMatchFlowState`는 `matchDataStore`에서 로스터·매치 스냅샷·뷰어·API 키 스냅샷을 합성해 준비 화면이 의존하는 최소 정보를 제공한다. 이 정규화 과정은 세션 복원과 권한 확인에 필수다.【F:lib/rank/matchFlow.js†L1-L171】
- `MatchReadyClient`는 준비 상태에서 로스터·모드·블라인드 안내를 카드화하고, API 키 미등록 경고 및 본게임 모달 호출(`StartClient`)을 관리한다. 본게임 진입 전에 정보 검증과 유저 안내를 담당하므로 구조를 유지한다.【F:components/rank/MatchReadyClient.js†L7-L197】
- `StartClient`는 `useStartClientEngine`으로부터 게임 그래프, 참가자, 로그, 타이머 등을 받아 메인 게임 헤더·패널·로그 뷰를 렌더링한다. 세션 메타 구성과 뒤로 가기 처리까지 일원화되어 있어 유지 가치가 높다.【F:components/rank/StartClient/index.js†L69-L159】
- 엔진은 `loadGameBundle`로 스테이지된 로스터와 슬롯 레이아웃을 병합하고, 프롬프트 그래프·경고를 패치해 플레이 전 데이터를 완비한다. 실패 시 경고를 클리어하는 흐름까지 포함되어 있어 유지한다.【F:components/rank/StartClient/useStartClientEngine.js†L1203-L1258】

**진행 현황**
- MatchReady → StartClient 모달 흐름은 이미 동작 중이며, API 키 경고·블라인드 안내·참가자 리스트가 준비 단계에서 검증을 마치도록 구현되어 있다.【F:components/rank/MatchReadyClient.js†L1-L220】
- `useStartClientEngine`은 `loadGameBundle` 호출 뒤 로스터 스냅샷 병합과 경고 로깅을 수행해 본게임 그래프/참가자 상태를 세팅한다. GameSession Store에 버전 필드만 추가하면 검증 루틴을 확장할 수 있는 구조다.【F:components/rank/StartClient/useStartClientEngine.js†L1188-L1248】【F:modules/rank/matchDataStore.js†L1-L118】

**정비/축소 후보**
- `MatchReadyClient`는 준비 상태와 본게임 모달을 한 컴포넌트에서 관리해 상태 분기가 많다. 준비 화면과 모달 트리거를 분리하고, `allowStart` 조건식을 커스텀 훅으로 추출해 테스트 가능하게 만든다.【F:components/rank/MatchReadyClient.js†L77-L199】
- `useStartClientEngine` 내부에서 로스터/슬롯 병합, 프롬프트 경고 수집, 상태 패치를 동시에 수행한다. 병합 로직을 독립 유틸로 빼고, 경고 로깅을 통합 핸들러로 정리해 엔진 초기화 책임을 축소한다.【F:components/rank/StartClient/useStartClientEngine.js†L1203-L1258】

### 2.6 메인 게임 룸 뷰(GameRoomView)
**유지해야 할 흐름**
- 룰·규칙 섹션은 `RULE_OPTION_METADATA` 기반으로 난입·엔드 조건·문자 제한을 해석해 카드화하고, 추가 키는 JSON/텍스트로 폴백해 전투 규칙을 한눈에 보여준다.【F:components/rank/GameRoomView.js†L13-L58】【F:components/rank/GameRoomView.js†L520-L621】
- 히어로 BGM/EQ/리버브/컴프레서 설정을 정규화해 `heroAudioManager`에 반영하고, 페이지 언마운트 시 기본값으로 롤백하는 흐름은 유지한다.【F:components/rank/GameRoomView.js†L60-L207】【F:components/rank/GameRoomView.js†L920-L960】
- 역할 점유율, 참가자 정렬, 타임라인/히스토리 축약 등 참가자 요약 지표를 `participantsByRole`·`buildHistorySearchText` 등으로 계산해 패널에 노출한다.【F:components/rank/GameRoomView.js†L962-L1120】【F:components/rank/GameRoomView.js†L641-L720】

**진행 현황**
- 오디오/룰/히스토리 헬퍼가 이미 세부 옵션까지 정규화하고 있으며, 참가자 패널도 역할별 필요 인원·초과 인원을 계산해 가시성을 제공한다.【F:components/rank/GameRoomView.js†L200-L399】【F:components/rank/GameRoomView.js†L962-L1120】
- 난입 규칙과 종료 조건은 룰 카드로 노출되고, 히스토리 검색 텍스트/리플레이 엔트리가 구축되어 있어 분석 뷰 구성이 어느 정도 완성돼 있다.【F:components/rank/GameRoomView.js†L520-L720】【F:components/rank/GameRoomView.js†L703-L719】

**정비/축소 후보**
- 오디오/룰/참가자 계산이 한 파일에서 이뤄져 1,000라인 이상으로 비대하다. 오디오 프로필·룰 카드·참가자 패널을 분리 컴포넌트로 재구성해 유지보수를 용이하게 한다.【F:components/rank/GameRoomView.js†L1-L1120】
- 히스토리/리플레이 빌더가 문자열 가공을 직접 수행한다. 검색 토큰화 로직을 유틸로 추출하고, 타임라인/배틀 로그 노출을 lazy chunk로 분할해 초기 렌더 비용을 줄인다.【F:components/rank/GameRoomView.js†L641-L720】

**추가 개선 사항**
- (완료) 모바일 세로 화면에서는 `GameRoomView` 상단 요약 카드가 토글 버튼/오버레이로 전환되고, 하단 고정 탭 버튼으로 `메인·캐릭터·랭킹` 패널을 이동할 수 있어 협소한 뷰포트에서도 본 게임 보드가 가려지지 않는다.【F:components/rank/GameRoomView.js†L331-L530】【F:components/rank/GameRoomView.module.css†L1-L160】

## 3. 구현 및 리팩터링 로드맵

### 3.1 1단계 – 데이터 구조 정비
- Maker 세트와 Rank 게임 등록이 공유하는 **배경/프롬프트 세트 식별자** 로컬 상태를 공통 스토리지 훅으로 추출한다.
- Supabase 호출 래퍼(`withTable`)와 등록 API를 서버-클라이언트 공용 유틸로 재구성해 에러 처리와 로깅을 일관화한다.
- 매칭 → 방 → 본게임 전환 시 공통으로 참조하는 **GameSession Store(가칭)**를 정의해 게임 ID, 슬롯/역할 매핑, 룸 생성 시각 등을 저장한다.

**코드 기준 세부 설계**
- `useMakerHome`은 `supabase.auth.getUser()` → `promptSetsRepository.list()` → `setRows` 순으로 동작한다. 동일 로직을 Rank 등록에서도 재사용할 수 있도록 `promptSet` 조회 훅을 공용화하고, `setErrorMessage` 흐름을 맞춘다.【F:hooks/maker/useMakerHome.js†L40-L133】
- Rank 등록의 `setId` 상태와 매칭 페이지의 `loadActiveRoles` 호출을 연결하기 위해, `PromptSetPicker` 선택값을 세션 스토리지에 캐시하고 Maker 홈에서 `importFromFile` 직후 동일 키에 쓰도록 통일한다.【F:components/rank/RankNewClient.js†L110-L208】【F:components/maker/home/MakerHomeContainer.js†L107-L167】
- 기존 `modules/rank/matchDataStore`는 매치 참가자·히어로 선택 상태를 세션에 저장한다. 여기에 `slotTemplate`(슬롯 번호·역할·버전) 필드를 추가해 매칭/방/본게임 흐름에서 GameSession Store의 최소 단위를 재사용한다.【F:modules/rank/matchDataStore.js†L1-L140】
- `readMatchFlowState`는 `matchDataStore`의 `matchSnapshot`·참가자 정보·API 키 스냅샷을 결합해 준비 화면 상태를 만든다. GameSession Store 확장 시 이 조립 과정을 기준 계약으로 삼고, 신규 필드를 주입할 어댑터를 마련한다.【F:lib/rank/matchFlow.js†L118-L171】

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
- 매칭 로비(`pages/rooms/index.js`)는 필터/리스트/실시간 구독이 한 파일에 공존한다. GameSession Store 정비 후 리스트 카드를 독립 컴포넌트로 승격시켜, 참가자 요약·드롭인 가능 여부를 재사용할 수 있게 한다.【F:pages/rooms/index.js†L31-L1467】
- 준비 화면(`MatchReadyClient`)은 메타/로스터/키 경고 패널을 한 컬럼에 배치한다. 카드 컴포넌트화와 본게임 버튼 영역 분리를 통해 로딩/오류 상태를 명시적으로 표현한다.【F:components/rank/MatchReadyClient.js†L138-L199】

#### 예상 문제 & 대응
- **UX 재배치 시 사용성 저하 우려**: 기존 제작자들이 익숙한 위치가 바뀔 수 있음 → 피처 플래그로 신 UI를 제한 공개하고, 유저 피드백을 수집해 단계적 롤아웃.
- **MDX/구성 객체 분리 시 번들 크기 증가**: 정적 콘텐츠가 번들에 포함되면 초기 로딩이 느려질 수 있음 → `dynamic import`와 정적 JSON fetch를 혼합해 최초 진입 시 최소 데이터만 로딩.
- **Context 분리 후 Prop Drilling 재발**: 하위 컴포넌트가 새 컨텍스트에 즉시 적응하지 못할 수 있음 → 컴포넌트별 adapter 훅을 정의해 기존 props 계약을 유지하면서 내부적으로 컨텍스트를 사용.

### 3.3 3단계 – 확장 기능 및 검증
- 게임 등록 시 이미지 미리보기, 규칙 토글과 `RulesChecklist` 간의 상호 검증(예: 난입 허용 시 종료 변수 필수)을 추가한다.
- Maker JSON 가져오기 시 스키마 버전 확인 로직을 추가하고, 호환되지 않는 경우 업그레이드 안내 배너를 띄운다.
- (완료) 등록 완료 후 곧바로 테스트 전투를 시작할 수 있는 CTA(“매치 시뮬레이터 열기”, “매치 준비 화면 이동”)를 Rank 허브와 연동해 등록 직후에도 허브 이동·시뮬레이션을 선택할 수 있게 했다.【F:components/rank/RankNewClient.js†L17-L27】【F:components/rank/RankNewClient.js†L228-L309】
- 룸 생성 시 `RoleSlotMatrix` 데이터를 캐시하고, 플레이어 매칭 단계에서 슬롯이 점유될 때마다 상태를 업데이트하여 메인 게임 진입 시 자동으로 역할별 초기화 데이터를 주입한다.

**코드 기준 세부 설계**
- (완료) 난입 허용 시 `endCondition`이 비어 있으면 `registerGame` 호출 전에 경고를 띄워 입력을 요구하고, 서버에서는 `pages/api/rank/register-game.js`에 동일 필수 검증을 재사용할 계획이다.【F:components/rank/RankNewClient.js†L235-L257】【F:pages/api/rank/register-game.js†L45-L94】
- Maker JSON 업로드는 `insertPromptSetBundle` 호출 후 바로 `refresh()`를 실행한다. 이 과정에 `payload.meta?.version` 체크를 추가하고, `useMakerEditor`의 `VARIABLE_RULES_VERSION`과 비교해 업그레이드 안내 배너를 띄운다.【F:hooks/maker/useMakerHome.js†L95-L133】【F:hooks/maker/useMakerEditor.js†L24-L70】
- 룸 생성 API(`/api/rank/match`)는 현재 슬롯 정보를 `rank_match_roster`에 스테이징한다. GameSession Store를 확장하면 `stage-room-match` 호출 전에 `matchDataStore.setGameMatchSnapshot`에 슬롯 버전을 씌워, 본게임 페이지(`/rooms/[id].js`)가 동일 데이터를 읽어 초기화한다.【F:pages/api/rank/match.js†L147-L419】【F:pages/rooms/[id].js†L287-L2136】【F:modules/rank/matchDataStore.js†L124-L204】
- `stage-room-match`는 참가자 통계와 영웅 요약을 합쳐 `rank_match_roster`를 재구성한다. 이제 `sync_rank_match_roster` RPC가 슬롯 버전·소스를 열에 기록해 `StartClient` 엔진이 번들을 병합할 때 동일 버전인지 재검증할 수 있다.【F:pages/api/rank/stage-room-match.js†L215-L306】【F:components/rank/StartClient/useStartClientEngine.js†L1203-L1258】

#### 예상 문제 & 대응
- **이미지 업로드 용량 초과/실패**: 사용자마다 업로드 환경이 다름 → 업로드 전 클라이언트에서 용량·확장자 검증, 실패 시 재업로드 힌트 제공, 서버에는 업로드 한도 초과 로그 추가.

**진행 현황 업데이트**
- Maker JSON 업로드 시 `payload.meta`의 변수 규칙 버전을 점검해 최신 포맷 안내를 띄우고, 성공적으로 불러온 세트는 확인 메시지를 노출한다.【F:hooks/maker/useMakerHome.js†L95-L163】【F:components/maker/home/MakerHomeHeader.js†L23-L55】
- 등록 폼과 `register-game` API가 `prepareRegistrationPayload` 유틸을 공유해 역할 점수 범위·슬롯 개수·난입 종료 조건을 동일 기준으로 검증하도록 정리했다.【F:lib/rank/registrationValidation.js†L1-L87】【F:components/rank/RankNewClient.js†L24-L120】【F:pages/api/rank/register-game.js†L1-L80】
- (신규) `/api/rank/register-game`이 역할과 슬롯을 함께 저장하도록 전환해, 프론트엔드가 Supabase 테이블에 직접 접근하지 않고도 검증된 슬롯 매핑을 재사용할 수 있게 했다.【F:components/rank/RankNewClient.js†L24-L340】【F:pages/api/rank/register-game.js†L1-L120】【F:lib/rank/registrationValidation.js†L1-L130】
- (신규) `register_rank_game` RPC SQL을 문서화하고 API가 우선 RPC를 호출하도록 조정해, Supabase가 배포만 끝내면 즉시 RPC 경로로 전환되고, 미배포 환경에서는 기존 테이블 삽입 경로로 자동 폴백한다.【F:pages/api/rank/register-game.js†L1-L83】【F:docs/sql/register-rank-game.sql†L1-L115】【F:docs/supabase-rank-session-sync-guide.md†L7-L22】
- (신규) 폴백 경로가 슬롯 업서트 대신 삭제→삽입 시퀀스를 사용하도록 조정하고, SQL 번들은 슬롯 중복 키를 명시적 제약으로 처리해 `game_id` 중복 참조 오류를 방지했다.【F:pages/api/rank/register-game.js†L83-L123】【F:docs/sql/register-rank-game.sql†L76-L105】
- GameSession Store가 `setGameMatchSlotTemplate`·`setGameMatchSessionMeta`로 슬롯 템플릿 버전과 세션 메타를 저장해 `MatchReady`와 `StartClient`가 동일한 슬롯 구성·턴 타이머 기본값을 공유한다.【F:modules/rank/matchDataStore.js†L1-L244】【F:lib/rank/matchFlow.js†L1-L220】【F:components/rank/StartClient/useStartClientEngine.js†L540-L940】
- `MatchReadyClient`에 턴 제한시간 투표 섹션을 도입해 선택 즉시 GameSession Store 세션 메타에 반영하고, `StartClient` 기본 타이머로 재사용할 수 있게 했다.【F:components/rank/MatchReadyClient.js†L1-L311】【F:modules/rank/matchDataStore.js†L360-L404】
- (신규) 방 상세 페이지가 로딩한 슬롯 배열을 기반으로 GameSession Store의 `slotTemplate`을 `room-load` 출처로 캐싱해, 매치 스테이징 이전에도 최신 RoleSlotMatrix를 공유한다.【F:pages/rooms/[id].js†L1317-L1371】
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
- `stage-room-match` API는 슬롯/참가자 정규화와 통계 결합이 핵심이다. Jest에서 `normalizeRosterEntries`와 삽입 쿼리를 모킹해, 누락 필드와 잘못된 토큰이 오류를 반환하는지 확인한다.【F:pages/api/rank/stage-room-match.js†L43-L200】

#### 예상 문제 & 대응
- **테스트 환경에서 로컬 스토리지 모킹 누락**: 브라우저/Node 환경 차이로 실패 가능 → Jest setup에 공통 storage mock 추가, Playwright는 `storageState` fixture로 초기 상태 유지.
- **Supabase 의존 테스트 불안정**: 네트워크 불안으로 flake 발생 → Supabase 호출을 테스트 더블로 대체하고, E2E는 전용 테스트 프로젝트/테이블 사용.
- **Playwright CI 실행 시간 증가**: E2E 시나리오가 늘어나면 10분 이상 소요될 수 있음 → 시나리오를 태그로 그룹화하고, PR에서는 핵심 시나리오만 실행하도록 워크플로 조정.

**진행 현황 업데이트**
- (신규) `useMakerHome` 훅의 무단 접근 처리, 목록 새로고침 실패 경고, 구버전 프롬프트 세트 알림을 검증하는 jsdom 테스트를 추가했다. 이를 통해 Maker 홈 공통 훅이 계획한 예외 흐름을 안전하게 처리하는지 회귀 방지를 마련했다.【F:__tests__/hooks/maker/useMakerHome.test.js†L1-L129】
- (신규) `stage-room-match` API가 슬롯 버전 충돌 시 409 오류를 반환하고 정상 케이스에서 Supabase RPC 페이로드를 완성하는지 검증하는 단위 테스트를 추가해, 낙관적 락과 슬롯 메타 연동 시나리오를 안전하게 커버했다.【F:__tests__/api/rank/stage-room-match.test.js†L1-L220】

### 3.5 구현 계획 보강 요약
- 프론트 훅/컴포넌트별로 확인한 상태명과 스토리지 키를 토대로, 중복 새로고침/메시지 처리·히스토리 저장·슬롯 매핑 구조 개선을 명확히 정의했다.【F:components/maker/home/MakerHomeContainer.js†L80-L167】【F:hooks/maker/useMakerEditor.js†L24-L138】【F:components/rank/RankNewClient.js†L110-L333】
- `matchDataStore`를 GameSession Store의 출발점으로 잡아, 매칭→방→본게임 데이터 전달에 필요한 `slotTemplate`·버전 필드 추가를 계획했다.【F:modules/rank/matchDataStore.js†L1-L176】【F:pages/rooms/index.js†L31-L1467】【F:pages/rooms/[id].js†L287-L2136】
- Rank 등록, Maker 편집기, 매칭 API가 공유해야 할 검증/스토리지/문자열 자산을 추출해 다국어/버전 관리 대비를 구체화했다.【F:components/rank/RankNewClient.js†L120-L350】【F:components/rank/RulesChecklist.js†L36-L101】【F:pages/api/rank/register-game.js†L45-L94】

## 4. 예상 산출물 & 후속 과제
- 통합 배경/세트 스토리지 훅, Supabase 유틸 리팩터링 PR
- Maker 홈/에디터 UI 정돈 및 고급 기능 패널화 PR
- 등록 탭 안내 콘텐츠 분리 및 규칙 검증 보강 PR
- 테스트 보강과 CI 파이프라인 알림 정비 PR
- GameSession Store 버전 관리 및 마이그레이션 가이드 문서화

## 5. 매칭 → 방 → 본게임 흐름 계획
- **매칭 페이지**: `rooms/index`는 모드 필터·영웅 참여 정보를 로딩하면서 세션 스토리지 기반 GameSession Store 기초 데이터를 준비한다. 필터링된 방 카드에서 잔여 슬롯·드롭인 가능 여부를 즉시 노출하도록, 로비는 `ROOM_BROWSER_AUTO_REFRESH_INTERVAL_MS` 폴링과 실시간 채널 이벤트를 동시에 소비한다.【F:pages/rooms/index.js†L31-L1467】
- **방 생성 단계**: 방 상세 페이지는 `loadRoom`으로 슬롯 템플릿과 호스트 레이팅을 수집하고, 점유율을 재계산해 상태를 갱신한다. 방 생성/삭제 시 지연 클린업 타이머가 남은 슬롯/방 레코드를 정리한다.【F:pages/rooms/[id].js†L1127-L1660】
- **방 입장/검색 단계**: 참가자가 모두 착석하면 `buildMatchTransferPayload` 결과를 `stage-room-match`에 전달해 `rank_match_roster`를 스테이징하고, 동시에 GameSession Store(`matchDataStore`)에 로스터·히어로 선택·매치 스냅샷을 기록한다.【F:pages/rooms/[id].js†L1989-L2104】【F:pages/api/rank/stage-room-match.js†L112-L200】【F:modules/rank/matchDataStore.js†L97-L204】
- **본게임 진입**: `MatchReadyClient`는 스테이지된 스냅샷을 불러와 API 키·로스터 준비 상태를 검증한 뒤 `StartClient`를 띄운다. 엔진은 `loadGameBundle`로 스테이지된 슬롯·참가자 정보를 병합하고, 프롬프트 그래프를 로딩해 실시간/드롭인 기능을 활성화한다.【F:components/rank/MatchReadyClient.js†L77-L199】【F:components/rank/StartClient/index.js†L69-L159】【F:components/rank/StartClient/useStartClientEngine.js†L1203-L1258】

### 5.1 본게임 실시간/턴 타이머 보강 계획
- **사전 투표 기반 제한시간 확정**: `MatchReadyClient` 상단에 제한시간 투표 모달을 추가해 15·30·60·120·180초 중 하나를 선택하게 하고, 합의된 값은 `startMatchMeta`와 함께 GameSession Store에 저장한다. `StartClient` 초기화 시 `createTurnTimerService.configureBase`를 호출해 해당 값을 기본 제한시간으로 설정한다.【F:components/rank/MatchReadyClient.js†L136-L215】【F:components/rank/StartClient/useStartClientEngine.js†L640-L706】【F:components/rank/StartClient/services/turnTimerService.js†L1-L70】
- **턴 타이머 UI/싱크 재구성**: 기존 `useStartClientEngine`의 `turnDeadline`·`timeRemaining` 스냅샷을 타이머 헤더 컴포넌트로 추출하고, 투표 결과에 따라 1턴 보너스(30초) 노출 여부를 명확히 표시한다. 실시간 모드에서는 `realtimeManager.beginTurn` 직후 `scheduleTurnTimer`를 호출하고, 비실시간 모드에서는 서버 스케줄러에 전송해 오프셋을 기록한다.【F:components/rank/StartClient/useStartClientEngine.js†L1406-L1442】【F:components/rank/StartClient/index.js†L146-L320】
- **난입 보너스 30초 적용**: 새 참가자가 동일 턴에 합류하면 `registerDropInBonus({ immediate: true })`로 30초 보너스를 적용하고, 드롭인 큐 스냅샷에 해당 턴을 기록해 중복 보너스를 방지한다. `dropInQueueService`와 `turnTimerService`의 보너스 값을 30초로 통일하고, 보너스 적용 시 `recordTimelineEvents`에 “턴 연장” 로그를 남겨 플레이어에게 피드백한다.【F:components/rank/StartClient/services/turnTimerService.js†L9-L70】【F:components/rank/StartClient/useStartClientEngine.js†L1555-L1587】【F:components/rank/StartClient/services/asyncSessionManager.js†L66-L96】
- (완료) `TurnSummaryPanel`을 도입해 준비 화면에서 확정된 제한시간·남은 시간·드롭인 보너스를 한 카드에서 확인하고, 드롭인 보너스 기본값을 30초로 통일했다.【F:components/rank/StartClient/TurnSummaryPanel.js†L1-L214】【F:components/rank/StartClient/services/turnTimerService.js†L1-L78】【F:components/rank/StartClient/useStartClientEngine.js†L3399-L3488】
- (완료) **가시성 토글과 참가자 정보 개선**: `StartClient` 상단 패널에 전투 정보·가시성 토글을 분리하고, `resolveHeroAssets` 결과를 이용해 캐릭터 초상·배경을 즉시 노출한다. 블라인드/비실시간 모드에서는 호스트 역할군만 전체 정보를 확인하고, 다른 참가자에게는 역할·상태만 표시하도록 조건부 렌더링을 추가한다.【F:components/rank/StartClient/index.js†L173-L314】【F:components/rank/StartClient/RosterPanel.js†L1-L212】【F:components/rank/StartClient/StartClient.module.css†L1-L132】

### 5.2 비실시간 매치 인원 충원 전략
- **동일 역할군 최대 3인 착석 제한**: 비실시간 모드(`isRealtimeEnabled`가 false)인 경우 `MatchReady` 단계에서 호스트와 동일 역할군의 최대 3명만 룸에 입장하도록 `setGameMatchParticipation`을 필터링하고, 초과 인원은 대기열에 남긴다.【F:components/rank/StartClient/useStartClientEngine.js†L662-L717】【F:modules/rank/matchDataStore.js†L147-L200】
- **랜덤 자동 충원 로직**: 부족한 슬롯은 `participantPool`(전 매치 참여자 목록)을 기반으로 역할·점수 기준으로 필터링한 뒤 중복 없이 무작위 선정한다. 선정된 플레이어는 `matchSnapshot.pendingMatch`에만 주입해 게임 내 실시간 데이터와 분리하고, 룸 UI에는 익명화된 통계만 노출한다.【F:modules/rank/matchDataStore.js†L147-L200】【F:lib/rank/matchFlow.js†L118-L170】
- **데이터 격리 보장**: 자동 충원 결과는 게임 본편에서만 소비하도록 `matchFlow` 리더가 `pendingMatch`를 병합할 때 참가자 세부 정보를 sanitize하고, `StartClient`는 `participantPool` 메타만 사용해 외부 플레이어 정보가 UI에 섞이지 않도록 한다.【F:lib/rank/matchFlow.js†L62-L171】【F:components/rank/StartClient/useStartClientEngine.js†L1203-L1262】
- (완료) 비실시간 방에는 “정원 미달 상태로 시작” 버튼을 별도로 제공하고, 버튼 클릭 시 부족 인원이 자동 충원 대기열로 이동함을 안내하는 토스트를 띄운다. `pages/rooms/[id].js`에서 `handleAsyncStart`가 호스트 전용 자동 충원 시작 버튼을 노출하고, `stageMatch` 공통 루틴을 호출해 매치 스테이징을 완료한 뒤 바로 MatchReady 단계로 전환한다.【F:pages/rooms/[id].js†L2054-L2139】
- (완료) `matchDataStore`가 비실시간 모드일 때 호스트 역할 좌석 제한, 대기 슬롯, 자동 충원 후보를 `sessionMeta.asyncFill`에 저장하고 `MatchReadyClient`가 대기열·후보 정보를 요약해 노출한다.【F:modules/rank/matchDataStore.js†L600-L690】【F:components/rank/MatchReadyClient.js†L180-L340】

### 5.3 턴 기반 동기화 플로우
- `matchDataStore`의 `sessionMeta`에 턴 커서/보너스/투표 결과를 함께 적재해 `MatchReady` → `StartClient` → 본게임이 동일한 스냅샷을 소비하도록 한다. 투표 결과는 이미 `setSessionMeta`로 저장되므로 동일 구조에 `turnCursor`·`dropInBonusAppliedAt` 등을 추가해 재동기화 트리거를 구현한다.【F:modules/rank/matchDataStore.js†L154-L244】【F:components/rank/MatchReadyClient.js†L210-L320】
- `StartClient`의 `useStartClientEngine`에서 `scheduleTurnTimer`와 `registerDropInBonus`가 호출될 때마다 `turnTimerService`와 `asyncSessionManager`가 발행하는 이벤트를 GameSession Store에 반영해, 각 참가자의 클라이언트가 동일한 턴 마감 시각과 보너스 적용 여부를 확인하게 한다.【F:components/rank/StartClient/useStartClientEngine.js†L640-L940】【F:components/rank/StartClient/services/turnTimerService.js†L1-L90】
- 드롭인/턴 진행 이벤트는 `matchFlow`가 읽어오는 세션 메타와 함께 `rooms/[id]` 실시간 채널로 브로드캐스트해 늦게 접속한 플레이어도 최신 턴 상태를 수신하게 한다. 채널 페이로드에는 세션 버전과 turn hash를 포함해 중복 이벤트를 무시한다.【F:lib/rank/matchFlow.js†L118-L220】【F:pages/rooms/[id].js†L1989-L2134】
- (완료) GameSession Store `sessionMeta.turnState`에 턴 번호·마감 시각·드롭인 보너스를 기록하고, `StartClient`가 턴 예약·보너스·완료 시점을 저장해 준비 화면/본게임이 동일한 제한시간 정보를 공유한다.【F:modules/rank/matchDataStore.js†L12-L210】【F:components/rank/StartClient/useStartClientEngine.js†L895-L1508】

### 5.5 메인 게임 실시간 동기화 로드맵
- **턴 상태 서버 브로드캐스트**: `enqueue_rank_turn_state_event` RPC를 호출해 `rank_turn_state_events` 테이블에 턴 스냅샷을 기록하고 Supabase Realtime으로 방송한다. 클라이언트는 `supabase.channel('rank-session:${sessionId}')` 구독을 유지하고 있으므로, 새로운 이벤트 타입(`rank:turn-state`)을 수신해 로컬 `sessionMeta.turnState`를 갱신한다.【F:components/rank/StartClient/useStartClientEngine.js†L3348-L3390】【F:docs/sql/rank-turn-realtime-sync.sql†L1-L101】
- **세션 메타 API 확장**: `/api/rank/session-meta`(신규)가 세션 토큰을 검사한 뒤 `upsert_match_session_meta`·`enqueue_rank_turn_state_event`를 호출해 제한시간·턴 상태를 저장한다. StartClient는 `buildSessionMetaRequest`로 스냅샷을 정규화한 뒤 이 API를 호출해 로컬 Store와 Supabase를 동시에 갱신한다.【F:pages/api/rank/session-meta.js†L1-L170】【F:components/rank/StartClient/index.js†L1-L260】【F:lib/rank/sessionMetaClient.js†L1-L240】
- **실시간 채널 재동기화**: `useStartClientEngine`의 실시간 채널 핸들러에서 신규 턴 이벤트를 병합하고, 지연 접속자를 위해 `matchDataStore`의 세션 메타와 서버 브로드캐스트를 비교해 최신 턴 번호를 선택한다. 채널 복구 시에는 `rank_turn_state_events` 최근 20개를 fetch하는 백필 엔드포인트를 호출해 누락을 보완한다.【F:components/rank/StartClient/useStartClientEngine.js†L3348-L3390】【F:modules/rank/matchDataStore.js†L154-L244】
- **드롭인 타임라인 연동**: 실시간 턴 이벤트에 드롭인 보너스 적용 내역을 포함시키고, `turnTimerService.registerDropInBonus`가 호출될 때 이벤트 페이로드를 만들어 서버 RPC에 전달한다. 이렇게 하면 나중에 서버 로그에서도 보너스 누적을 확인할 수 있다.【F:components/rank/StartClient/services/turnTimerService.js†L1-L90】【F:components/rank/StartClient/useStartClientEngine.js†L1440-L1755】
- **백엔드 준비 사항**: `docs/sql/rank-turn-realtime-sync.sql`을 Supabase SQL Editor에 실행해 테이블·RPC·퍼블리케이션을 생성하고, Edge Function(예: `start_match`)이 RPC를 사용하도록 서비스 롤 키를 주입한다. 배포 후에는 실시간 채널 이벤트를 로깅하기 위해 `supabase/functions/_shared/notifications.ts`에 턴 이벤트 핸들러를 추가한다.【F:docs/sql/rank-turn-realtime-sync.sql†L1-L101】【F:supabase/functions/_shared/notifications.ts†L1-L120】

### 5.4 예상 문제 & 대응
- **슬롯 데이터 동시 갱신 충돌**: `sync_rank_match_roster` RPC가 슬롯 버전 필드를 검증하도록 도입돼, 더 최신 버전을 가진 요청만 성공한다. 추후에는 부분 업데이트를 고려하지만 현재는 버전 충돌 시 `slot_version_conflict` 오류를 반환하도록 막았다.【F:pages/api/rank/stage-room-match.js†L215-L306】【F:docs/sql/sync-rank-match-roster.sql†L1-L112】
- **방 검색 성능 저하**: 실시간 방 수가 늘어나면 쿼리 비용 증가 → 로비에서 실시간 채널 이벤트를 디바운스하고, 자동 새로 고침 주기를 피처 플래그로 조절한다.【F:pages/rooms/index.js†L1406-L1467】
- **본게임 진입 전 검증 실패**: GameSession Store와 Supabase 데이터가 어긋날 수 있음 → `MatchReadyClient`에서 `readMatchFlowState`와 서버 검증을 묶고 실패 시 재시도/룸 복귀 경로를 제공한다.【F:lib/rank/matchFlow.js†L118-L171】【F:components/rank/MatchReadyClient.js†L96-L155】

## 6. 진행 현황 체크리스트
- [x] 게임 등록 폼이 Supabase 인증·역할 중복 제거·슬롯 업서트를 끝까지 수행하며 `/rank/${gameId}`로 전환하는 MVP 플로우 확립.【F:components/rank/RankNewClient.js†L12-L333】
- [x] 방 상세 → MatchReady → StartClient로 이어지는 스테이징·세션 동기화 루프 구축, `setGameMatchSnapshot`까지 연계 완료.【F:pages/rooms/[id].js†L2025-L2134】【F:components/rank/MatchReadyClient.js†L1-L220】【F:components/rank/StartClient/useStartClientEngine.js†L1188-L1248】
- [x] GameRoomView가 룰 카드·오디오 프로필·참가자 통계를 모두 계산해 뷰어에게 제공하는 상태 유지.【F:components/rank/GameRoomView.js†L13-L1120】
- [x] GameRoomView 모바일 세로 레이아웃을 요약 토글/하단 고정 탭으로 전환해 본게임 뷰가 가려지지 않도록 보강했다.【F:components/rank/GameRoomView.js†L331-L530】【F:components/rank/GameRoomView.module.css†L1-L160】
- [x] GameSession Store가 슬롯 템플릿 버전·세션 메타를 저장하고 `MatchReady`/`StartClient`가 동일한 데이터를 초기화에 활용하도록 확장했다.【F:modules/rank/matchDataStore.js†L1-L244】【F:lib/rank/matchFlow.js†L1-L220】【F:components/rank/StartClient/useStartClientEngine.js†L540-L940】
- [x] `StartClient`가 턴 예약·드롭인 보너스·턴 완료 시점을 `sessionMeta.turnState`에 기록해 참가자 전원이 동일한 제한시간 정보를 공유한다.【F:modules/rank/matchDataStore.js†L12-L210】【F:components/rank/StartClient/useStartClientEngine.js†L895-L1508】
- [x] StartClient가 `buildSessionMetaRequest`와 `/api/rank/session-meta`를 통해 세션 메타·턴 상태를 Supabase에 동기화하고, `rank_turn_state_events` 테이블로 브로드캐스트할 준비를 마쳤다.【F:components/rank/StartClient/index.js†L1-L260】【F:lib/rank/sessionMetaClient.js†L1-L240】【F:pages/api/rank/session-meta.js†L1-L170】
- [x] StartClient TurnSummaryPanel이 투표 결과·마감 시각·드롭인 보너스를 요약하고 드롭인 보너스 기본값을 30초로 정비했다.【F:components/rank/StartClient/TurnSummaryPanel.js†L1-L214】【F:components/rank/StartClient/services/turnTimerService.js†L1-L78】
- [x] 등록 안내 텍스트/난입 설명 분리 및 다국어 구조화 계획 수립, `RankNewClient`·`RulesChecklist` 리소스를 `rankRegistrationContent` 데이터로 이동해 공유.【F:components/rank/RankNewClient.js†L120-L355】【F:components/rank/RulesChecklist.js†L1-L60】【F:ai-roomchat/data/rankRegistrationContent.js†L1-L60】
- [x] 등록 탭 레이아웃을 `RegistrationLayout`/`RegistrationCard`/`SidebarCard`로 세분화해 개요 사이드바와 본문 카드를 분리하고, 모드·난입·규칙 입력 흐름을 재구성했다.【F:components/rank/RankNewClient.js†L335-L512】【F:components/rank/registration/RegistrationLayout.js†L1-L83】【F:components/rank/registration/SidebarCard.js†L1-L20】
- [x] 방 검색 페이지의 필터와 결과 목록을 `RoomFiltersSection`·`RoomResultsSection` 컴포넌트로 분리해 로비 상태 계산과 UI 표현을 느슨하게 결합했다.【F:components/rank/rooms/RoomFiltersSection.js†L1-L153】【F:components/rank/rooms/RoomResultsSection.js†L1-L153】
- [x] Next 빌드가 `prop-types` 의존성 없이 통과하도록 룸 필터/검색 컴포넌트의 PropTypes 선언을 JSDoc 기반 설명으로 대체했다.【F:components/rank/rooms/RoomFiltersSection.js†L1-L154】【F:components/rank/rooms/RoomResultsSection.js†L1-L154】
- [x] GameRoomView 오디오/히스토리 유틸을 분리 컴포넌트화하고, 타임라인/리플레이 노출을 lazy chunk로 나누어 렌더 부하를 낮췄다.【F:components/rank/GameRoomView.js†L1-L360】【F:components/rank/GameRoomHistoryPane.js†L1-L151】【F:lib/rank/gameRoomAudio.js†L1-L360】【F:lib/rank/gameRoomHistory.js†L1-L80】
- [x] 비실시간 방에서 `sessionMeta.asyncFill`에 좌석 제한·대기열·자동 충원 후보를 저장하고 MatchReady 화면에서 요약 정보를 노출한다.【F:modules/rank/matchDataStore.js†L600-L690】【F:components/rank/MatchReadyClient.js†L180-L340】
- [x] `register-game` API가 OPTIONS 프리플라이트를 허용하고 등록 화면의 실시간 모드 선택지를 표준/Pulse만 노출하도록 조정해 브라우저 요청이 400 오류 없이 진행되도록 했다.【F:pages/api/rank/register-game.js†L7-L24】【F:data/rankRegistrationContent.js†L27-L34】【F:components/rank/RankNewClient.js†L92-L116】
- [x] `stage-room-match` 낙관적 락·슬롯 버전 필드 추가 및 API 유틸 통합을 `sync_rank_match_roster` RPC로 마무리했다. API는 RPC 오류를 해석해 409 충돌을 반환한다.【F:pages/api/rank/stage-room-match.js†L215-L320】【F:docs/sql/sync-rank-match-roster.sql†L1-L112】

---
**백엔드 TODO**: Supabase 역할/슬롯 검증 함수 공통화, RoomInitService용 슬롯/역할 캐시 테이블 및 락 RPC 추가, `validate_session` RPC 및 슬롯 버전 필드 도입, 제한시간 투표·비실시간 자동 충원 결과를 저장하는 `upsert_match_session_meta`/`refresh_match_session_async_fill` RPC 배포, 턴 상태 브로드캐스트 테이블(`rank_turn_state_events`)과 `enqueue_rank_turn_state_event` RPC 적용, 이미지 업로드 정책(용량/파일형식) 강화, 등록/매칭 로그 감사 테이블 확장. → 관련 스키마·정책·RPC 초안은 `docs/supabase-rank-backend-upgrades.sql`에 모아두었으며, 세션 메타 동기화만 빠르게 배포하려면 `docs/sql/upsert-match-session-meta.sql`, `docs/sql/refresh-match-session-async-fill.sql`, `docs/sql/rank-turn-realtime-sync.sql`을 Supabase SQL Editor에 붙여넣으면 된다.
**추가 필요 사항**: 다국어 대비 문자열 리소스 분리, 매칭/룸 UI 카피 검수, GameSession Store 스키마 및 Maker JSON 버전 문서화, 비실시간 자동 충원 통계 대시보드 정의, 테스트 환경용 Supabase 프로젝트 분리.
**진행 상황**: 2-1 단계(공용 스토리지, Maker 홈 정비, 에디터 상태 분리·고급 도구 패널 구축)와 2-2 단계(안내/체크리스트 리소스 분리, 레이아웃 재배치)를 마무리했고, 2-3 단계에서는 방 로비 필터·검색 결과를 컴포넌트화해 상태 계산과 뷰 계층을 분리했다. GameRoomView는 오디오/히스토리 유틸을 전용 모듈과 `GameRoomHistoryPane` lazy chunk로 이관한 데 이어 모바일 뷰에서 요약 토글·하단 고정 탭을 제공해 협소 화면에서도 본게임 판이 유지되도록 조정했다.【F:components/rank/GameRoomView.js†L331-L530】【F:components/rank/GameRoomHistoryPane.js†L1-L151】 GameSession Store는 슬롯 템플릿·세션 메타 저장까지 확장되어 본게임 초기화 루프에 연결되었으며, 이번 업데이트로 `sessionMeta.turnState`에 턴 예약·드롭인 보너스·완료 정보를 기록해 `MatchReady`와 `StartClient`가 동일한 제한시간 스냅샷을 공유한다.【F:modules/rank/matchDataStore.js†L12-L210】【F:components/rank/StartClient/useStartClientEngine.js†L895-L1508】 또한 StartClient 상단에 `TurnSummaryPanel`을 추가해 제한시간 투표·남은 시간·드롭인 보너스를 통합 표기하고 드롭인 보너스 기본값을 30초로 정비했다.【F:components/rank/StartClient/TurnSummaryPanel.js†L1-L214】【F:components/rank/StartClient/services/turnTimerService.js†L1-L78】 가시성 토글과 참가자 요약 패널을 추가해 블라인드·비실시간 모드에서는 호스트 역할군만 상세 정보를 열람하고, 권한이 없는 플레이어는 능력·스탯이 익명 처리되도록 했다.【F:components/rank/StartClient/index.js†L173-L314】【F:components/rank/StartClient/RosterPanel.js†L1-L212】【F:components/rank/StartClient/StartClient.module.css†L1-L132】 5단계 계획에는 제한시간 투표·난입·비실시간 충원 전략에 더해 턴 기반 동기화 플로우와 실시간 브로드캐스트 로드맵을 추가해 세션 전 구간에서 동일한 턴 스냅샷을 유지하도록 방향을 보강했다.【F:components/rank/MatchReadyClient.js†L210-L320】【F:components/rank/StartClient/useStartClientEngine.js†L1440-L1755】【F:docs/sql/rank-turn-realtime-sync.sql†L1-L101】 이번 회차에는 Supabase에서 좌석 제한·대기열을 계산하는 `refresh_match_session_async_fill` SQL 스니펫과 턴 브로드캐스트 스니펫을 추가해 비실시간 충원·턴 동기화 계획의 서버 준비도를 한 단계 끌어올렸다.【F:docs/sql/refresh-match-session-async-fill.sql†L1-L220】【F:docs/sql/rank-turn-realtime-sync.sql†L1-L101】【F:docs/supabase-rank-session-sync-guide.md†L88-L231】 새롭게 비실시간 방 호스트에게 “자동 충원으로 시작” 버튼과 안내 문구를 제공해 슬롯이 덜 차도 매치를 시작하고 대기열 충원 정보를 전달할 수 있게 되었으며, MatchReady 단계까지 공통 스테이징 루틴을 재사용하도록 조정했다.【F:pages/rooms/[id].js†L2054-L2139】 로비는 영웅 참여/참여자 쿼리 실패 시 상단 알림 카드와 재시도 버튼을 노출하고, `RoomRefreshIndicator` 공용 배지를 통해 실시간 상태·카운트다운 정보를 일관되게 제공하도록 보강되었다.【F:pages/rooms/index.js†L906-L1160】【F:components/rank/rooms/RoomResultsSection.js†L39-L112】【F:components/rank/rooms/RoomRefreshIndicator.js†L1-L63】 등록 흐름에는 성공 직후 Rank 허브 이동·매치 준비·매치 시뮬레이터 진입을 선택할 수 있는 CTA 카드를 추가해 테스트 전투 진입 계획을 실제 UX로 연결했다.【F:components/rank/RankNewClient.js†L228-L309】 다음 작업은 로비 상태 요약의 스토리북 샘플, 등록 폼 검증 보강, 3단계 확장 기능 준비로 이어진다.

### 7. 검증 및 시뮬레이션 기록
- `matchDataStore` 확장 분기와 세션 메타 합성 동작을 확인하기 위해 `npm test -- matchDataStore`를 실행했고, GameSession Store 관련 단위 테스트 7건이 모두 통과했다. 이를 통해 턴 상태, 비실시간 충원 스냅샷, 슬롯 템플릿 버전 병합이 계획대로 동작함을 재검증했다.【df07ee†L1-L13】
- Next.js 프로덕션 빌드를 수행(`npm run build`)해 MatchReady/StartClient 리팩터링, GameRoomView 모바일 레이아웃, 로비 컴포넌트 분리를 포함한 전체 페이지 구성이 문제 없이 번들링되는지 확인했다. 빌드는 경고 없이 완료되어 현 시점 계획 범위가 배포 관점에서도 안정적임을 확인했다.【0ea82a†L1-L66】
- StartClient 가시성 토글과 참가자 정보 마스킹 동작을 검증하는 jsdom 기반 단위 테스트를 추가했다. `RosterPanel`이 비공개 모드에서 정보를 숨기고, 호스트·동일 역할·본인 좌석에 대해서만 상세 정보를 복구하는지 확인해 가시성 계획의 회귀를 방지한다.【F:__tests__/components/rank/StartClient/RosterPanel.test.js†L1-L108】
- Maker 홈 공용 훅 `useMakerHome`에 대한 jsdom 테스트(`npm test -- useMakerHome`)를 실행해 무단 접근, 새로고침 실패 경고, 구버전 세트 알림 흐름이 모두 정상적으로 동작함을 확인했다.【47ccd0†L1-L11】
- `stage-room-match` API 테스트(`npm test -- stage-room-match`)를 추가 실행해 슬롯 버전 충돌과 성공 시나리오를 시뮬레이션했고, 새로운 낙관적 락 흐름이 의도대로 동작함을 확인했다.【7a8234†L1-L16】
