# 페이지별 상태 & 로직 지도

이 문서는 주요 페이지 컴포넌트가 어떤 상태 변수와 공용 스토리지를 사용하고, 매칭/메인 게임 로직이 어떻게 연결되는지 요약합니다. (2024-03 기준 코드 분석)

## 1. 글로벌 셸 & 오버레이
- **`pages/_app.js`**: `OverlayAwareShell`이 경로를 확인해 `/character`, `/roster`, `/maker`, `/prompt` 하위에서는 공유 영웅 오버레이를 숨기고, 그 외에는 `SharedHeroOverlay`를 켭니다. `ActiveMatchOverlay`는 항상 포함되어 다른 화면에서도 실시간 매치 현황을 노출합니다.

## 2. 인증 & 랜딩 플로우
| 경로 | 주요 상태 / 훅 | 공용 스토리지 & 일관성 포인트 |
| --- | --- | --- |
| `/` (`pages/index.js`) | `useEffect`로 `supabase.auth.getSession()` 조회 → 세션이 있으면 `/roster`로 리디렉션. `supabase.auth.onAuthStateChange` 구독해 로그인/로그아웃 시 라우팅. | 로컬 스토리지는 건드리지 않음. 모든 이동은 Next Router를 통해 수행. |
| `/auth-callback` (`pages/auth-callback.js`) | `msg` 상태로 진행 상황 표시. `handleOAuthCallback` 실행 후 결과에 따라 라우팅 및 메시지 업데이트. | 외부에서 설정한 OAuth 처리 결과에 따라 `/`, `/roster` 등으로 이동. |

## 3. 캐릭터 & 로스터 뷰
| 경로 | 주요 상태 / 훅 | 공용 스토리지 & 일관성 포인트 |
| --- | --- | --- |
| `/roster` (`pages/roster.js`) | `useRoster` 훅이 `loading`, `error`, `heroes`, `displayName`, `avatarUrl` 등 반환. 선택 시 `/character/[id]` 이동. | `useRoster`가 로그인한 사용자 ID와 영웅 목록을 로컬 스토리지 `selectedHeroOwnerId`, `selectedHeroId`와 동기화하며, 사라진 ID는 정리. |
| `/character/[id]` (`pages/character/[id].js`) | `useCharacterDetail` 훅으로 `loading`, `error`, `hero`. 로딩/에러/권한 없음 상태를 풀스크린으로 처리. | 영웅 데이터가 로드되면 `localStorage`에 `selectedHeroId`, `selectedHeroOwnerId`를 저장하고 `hero-overlay:refresh` 이벤트 발행. |
| `/create` (`pages/create.js`) | `CreateHeroScreen`이 `useHeroCreator` 상태(이름, 설명, 능력, 미디어 업로드 상태 등)를 관리. | `selectedHeroBackgroundUrl`을 로컬 스토리지에서 읽어 배경으로 사용. 업로드 선택 시 미리보기 상태로 저장. |

## 4. 로비 & 게임 탐색
| 경로 | 주요 상태 / 훅 | 공용 스토리지 & 일관성 포인트 |
| --- | --- | --- |
| `/lobby` (`pages/lobby.js`) | `activeTab`, `storedHeroId`, `backgroundUrl` 상태. `useGameBrowser` 두 번(공개/내 게임), `useLobbyStats` 한 번 사용. 탭·쿼리·정렬·선택 게임·참여 등 모든 조작을 훅이 제공. | 로컬 스토리지에서 `selectedHeroId`, `selectedHeroBackgroundUrl`을 읽어 배경과 복귀 경로를 맞춤. 게임 입장 시 `/rank/[id]`로 이동. |

### 4.1 로스터 → 오버레이 → 로비 → 메인룸 → 모드 선택 흐름
1. **로스터에서 캐릭터 선택**: `/roster`는 `RosterContainer`가 `useRoster`로 불러온 영웅 목록을 `RosterView`에 넘기고, 카드 터치 시 `selectedHeroId`·`selectedHeroOwnerId`를 로컬 스토리지에 저장한 뒤 `/character/[id]`로 이동합니다.【F:starbase/ai-roomchat/components/roster/RosterContainer.js†L16-L63】
2. **캐릭터 상세 진입**: `/character/[id]`는 `useCharacterDetail`로 영웅을 로드하고, 성공 시 동일한 스토리지 키를 갱신하며 `hero-overlay:refresh` 이벤트를 쏴서 글로벌 오버레이를 새로고침합니다.【F:starbase/ai-roomchat/pages/character/[id].js†L58-L128】
3. **공유 오버레이 활성화**: `_app.js`의 `OverlayAwareShell`이 캐릭터/로스터를 벗어난 경로에서 `SharedHeroOverlay`를 노출하고 항상 `ActiveMatchOverlay`를 덧붙여, 이후 화면에서도 하단 HUD가 따라다니게 합니다.【F:starbase/ai-roomchat/pages/_app.js†L1-L29】
4. **하단 오버레이에서 탐색**: `SharedHeroOverlay`는 선택된 영웅 정보를 상태로 들고 있으며 `overlayTabs`에 `search` 탭을 포함합니다. 검색 탭에서는 입력·정렬 상태(`searchTerm`, `searchSort`)를 이용해 필터링된 게임 목록을 보여 주어 로비로 넘어가기 전에 관심 있는 게임을 훑어볼 수 있습니다.【F:starbase/ai-roomchat/components/character/SharedHeroOverlay.js†L765-L876】【F:starbase/ai-roomchat/components/character/SharedHeroOverlay.js†L1191-L1219】
5. **로비에서 게임 고르기**: `/lobby`는 `useGameBrowser`가 제공하는 목록/참여 정보를 `GameSearchPanel`에 전달하고, `handleEnterGame`으로 선택된 게임(및 역할)을 `/rank/[id]` 경로로 푸시합니다.【F:starbase/ai-roomchat/pages/lobby.js†L40-L143】
6. **게임 검색 패널 구성**: `GameSearchPanel`은 좌측 검색/정렬 컬럼과 우측 상세 패널로 나뉘어 `GameDetail`에 참가자·역할 데이터를 전달합니다.【F:starbase/ai-roomchat/components/lobby/GameSearchPanel/index.js†L1-L58】
7. **참여 & 역할 지정**: `GameDetail`은 이미 참여 중이면 즉시 입장시키고, 아니라면 가장 여유 있는 역할을 기본 선택한 뒤 `참여하기` 버튼으로 `onJoinGame` 실행 후 `/rank/[id]` 이동을 트리거합니다.【F:starbase/ai-roomchat/components/lobby/GameSearchPanel/GameDetail.js†L38-L182】
8. **메인룸 진입**: `/rank/[id]`는 `useGameRoom`으로 게임/참여자/역할을 불러와 `GameRoomView`에 넘기고, 스타트 버튼을 누르면 `GameStartModeModal`을 띄웁니다. 모달에서 저장한 프리셋은 `rank.start.*` 세션 스토리지 키로 보존합니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L22-L263】
9. **메인룸 탭과 준비 UI**: `GameRoomView`는 `메인 룸`·`캐릭터 정보`·`랭킹` 탭과 턴 제한 투표, 시작 버튼 등을 렌더링해 방장을 위한 준비 화면을 구성합니다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L55-L152】
10. **모드/키/타이머 설정**: `GameStartModeModal`은 API 버전·API 키 입력 필드와 턴 제한 투표, 솔로·듀오·캐주얼 옵션을 한 번에 선택할 수 있도록 하고, 확인 시 어떤 모드를 택했는지 콜백으로 돌려줍니다.【F:starbase/ai-roomchat/components/rank/GameStartModeModal.js†L1-L205】【F:starbase/ai-roomchat/components/rank/GameStartModeModal.js†L200-L399】
11. **매칭 페이지 라우팅**: 모달 확인을 받으면 `/rank/[id]` 페이지가 솔로·듀오·캐주얼(매칭/사설)·시나리오 실행(`/start`) 경로 중 하나로 이동시켜 각 모드 전용 클라이언트를 띄울 준비를 합니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L191-L215】
12. **본 게임 실행**: `/rank/[id]/start`는 동적 로딩된 `StartClient`를 불러와 게임 번들을 실행하며, `useStartClientEngine`이 API 키/버전 상태를 유지하고 로딩 완료 시 `handleStart()`로 전투를 자동 개시합니다.【F:starbase/ai-roomchat/pages/rank/[id]/start.js†L1-L4】【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L74-L174】

## 5. 랭크 허브 & 게임룸
| 경로 | 주요 상태 / 훅 | 공용 스토리지 & 일관성 포인트 |
| --- | --- | --- |
| `/rank` (`pages/rank/index.js`) | `count` 상태로 전체 게임 수 표시. `GameListPanel`이 실제 목록 렌더링. | 세션 스토리지/로컬 스토리지 접근 없음. |
| `/rank/[id]` (`pages/rank/[id].js`) | 페이지 로컬 상태: `showLeaderboard`, `pickRole`, `showStartModal`, `startPreset`, `turnTimerVote(s)` 등. `useGameRoom`에서 `game`, `roles`, `participants`, `myHero`, `recentBattles`, `canStart`, `isOwner` 등 수신. | `useGameRoom`이 로컬 스토리지 `selectedHeroId`를 읽어 참여자와 매칭. 페이지는 `rank.start.*` 키를 세션 스토리지에 저장/복원(모드, 듀오 옵션, 캐주얼 옵션, API 버전/키, 턴 타이머, 투표 현황). |
| `/rank/[id]/solo`, `/rank/[id]/duo`, `/rank/[id]/casual-*` 등 | 각 모드는 `components/rank`의 클라이언트(예: `RankNewClient`, `MatchQueueClient`, `CasualMatchClient`)를 사용해 대기열 및 준비 UI를 구성. | 공통으로 `rank.start.*` 세션 스토리지 값을 읽어 초기 설정을 유지. |
| `/rank/new` | 새 게임 생성 폼 컴포넌트. 생성 후 `/rank/[id]`로 이동. | 로그인 정보는 Supabase 세션 기반. |

## 6. 메이커(프롬프트 세트)
| 경로 | 주요 상태 / 훅 | 공용 스토리지 & 일관성 포인트 |
| --- | --- | --- |
| `/maker` (`pages/maker/index.js`) | `MakerHomeContainer`가 `useMakerHome`으로 세트 목록/에러/로딩 관리. 로컬 상태로 이름 편집, 액션 시트, 임포트 파일 상태 등을 보관. | 로컬 스토리지 `selectedHeroId`, `selectedHeroBackgroundUrl`을 읽어 뒤로 가기 경로와 배경을 일치. |
| `/maker/[id]` | 에디터 화면이 `usePromptMaker` 계열 훅으로 세트, 프롬프트, 브릿지 변수를 관리하고, 임포트/엑스포트/공개 변수를 처리. | URL에서 세트 ID 추출해 공유. 슬롯 토큰(`slotN`) 등은 `VariableDrawer`에서 정규식으로 감지하여 일관성을 유지. |

## 7. 공통 스토리지 키 & 일관성 메모
- `selectedHeroId` / `selectedHeroOwnerId`: 로스터, 캐릭터 상세, 게임룸, 메이커, 로비에서 공통 사용. 선택된 영웅 컨텍스트를 유지.
- `selectedHeroBackgroundUrl`: 캐릭터 생성기와 메이커, 로비 배경에서 공유.
- `rank.start.*` (mode, duoOption, casualOption, apiVersion, apiKey, turnTimer, turnTimerVote, turnTimerVotes): 랭크 게임 시작 및 매치 대기 UI 전반에서 세션 단위로 설정을 유지.
- 실시간 매치 오버레이는 글로벌 `_app`에 상주하며, `window.dispatchEvent('hero-overlay:refresh')` 등 커스텀 이벤트로 갱신 트리거.

## 8. 매칭 로직 흐름
1. **역할/대기열 데이터 수집**: `lib/rank/matchmakingService.loadActiveRoles`가 게임별 활성 역할과 슬롯 수를 읽고, `loadQueueEntries`가 상태 `waiting`인 대기열을 모읍니다. 필요 시 `loadParticipantPool`이 이미 방에 있는 참가자를 가상 엔트리로 변환해 큐에 추가합니다.
2. **매처 선택**: 모드에 따라 `MATCHER_BY_KEY`에서 매처 함수를 고릅니다. (`getMatcherKey`, `getDefaultPartySize` 참조)
3. **매칭 알고리즘** (`lib/rank/matching.js`):
   - 역할 정의를 정규화(`normalizeRoles`)하고 총 슬롯 수를 계산합니다.
   - 큐를 역할별 버킷으로 나누고(`buildRoleBuckets`), 점수 윈도우(랭크) 또는 슬롯 수(캐주얼)에 맞춰 그룹을 선택합니다.
   - 필요한 슬롯을 채우면 `assignments` 배열을 반환하고, 부족할 경우 원인(`no_candidates`, `insufficient_candidates` 등)을 `error`에 기록합니다.
   - 랭크 매칭은 점수 창(`scoreWindows`)을 단계적으로 확대하면서 anchor 그룹을 선택하여 밸런스를 맞춥니다. 캐주얼 매칭은 단순 순차 채우기 전략을 사용합니다.
4. **Supabase 업데이트**: `markAssignmentsMatched`가 매칭된 대기열 엔트리를 `matched`로 표시하고 타임스탬프/매치 코드를 갱신합니다. 실시간 매치가 아니라면 호출 측에서 `loadParticipantPool`과 함께 남은 대기열을 재검토해 후속 처리를 이어갑니다.

## 9. 메인 게임 진행 로직
### 9.1 게임룸 준비 (`hooks/useGameRoom.js`)
- 게임 ID로 초기 부트스트랩: 사용자 인증 확인, `rank_games`/`rank_game_roles`/`rank_game_slots`/`rank_participants`/`rank_battles`를 순차로 불러와 `game`, `roles`, `participants`, `recentBattles` 상태를 채웁니다.
- `normalizeRoles`와 `computeRequiredSlots`로 역할 구성과 최소 필요 인원을 계산해 `canStart`, `minimumParticipants`를 파생.
- `joinGame` 액션은 현재 선택 영웅(`myHero`)과 역할 정원(`slot_count`)을 확인한 뒤 `rank_participants`에 삽입.
- `deleteRoom`은 게임 소유자만 실행 가능하며, 관련 테이블을 일괄 삭제 후 콜백 호출.

### 9.2 시나리오 실행 (`components/rank/StartClient/useStartClientEngine.js`)
- 초기 상태: `game`, `participants`, 스토리 그래프(`graph`), 프롬프트 히스토리, 턴 진행(`turn`, `currentNodeId`), 수동 응답, API 설정(`apiKey`, `apiVersion`), 턴 제한 타이머 등을 `useState`로 관리.
- 게임 번들 로드(`loadGameBundle`) 후 `buildSlotsFromParticipants`로 슬롯/배역을 정렬하고, `parseRules`를 통해 시스템 메시지를 생성.
- 각 턴마다 `pickNextEdge`로 다음 노드를 결정하고, `makeNodePrompt`로 AI 프롬프트를 생성. 사용자 입력 또는 AI 응답을 히스토리에 추가하고 `updateActiveSessionRecord`로 세션 진행 상황을 브라우저 스토리지에 저장.
- 승리/패배 여부는 `parseOutcome`로 판정하며, 패배 시 `markActiveSessionDefeated`, 완료/중단 시 `clearActiveSessionRecord`를 호출.
- 백그라운드 음악/이미지, 등장 영웅 이름 등을 `activeHeroAssets`, `activeActorNames` 상태에 저장해 UI가 동기화되도록 합니다.

이 정리로 페이지별 상태 사용과 매칭·게임 흐름 간 연결 고리를 빠르게 파악할 수 있습니다.
