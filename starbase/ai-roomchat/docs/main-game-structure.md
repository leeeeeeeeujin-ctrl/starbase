# 메인 게임(Start) 구조 개요

이 문서는 랭크 모드 본게임(`/rank/[id]/start`) 화면을 구성하는 주요 진입점과 엔진 레이어를 정리합니다. 매칭 플로우 문서를 통해 전투 준비까지 살펴본 뒤, 실제 전투 화면이 어떤 구조로 동작하는지를 확인하는 용도로 활용할 수 있습니다.

## 1. 진입점과 번들 로딩
- Next.js 라우터는 `/rank/[id]/start` 요청을 받으면 클라이언트 전용 `StartClient` 컴포넌트를 동적으로 불러옵니다.【F:pages/rank/[id]/start.js†L1-L4】
- `StartClient`는 `useGameBundle` 훅을 통해 Supabase에서 게임 번들을 읽어오고, 로딩·에러 상태를 관리합니다. 이 훅은 게임 ID가 없을 때 즉시 에러를 반환하고, 활성화 상태에 따라 비동기 로딩을 수행합니다.【F:components/rank/StartClient/index.js†L271-L309】

## 2. 전투 화면 레이아웃
- 배경과 헤더는 번들에 포함된 이미지와 게임 메타데이터를 활용해 동적으로 꾸며지며, 나가기 버튼 같은 상단 제어 UI를 제공합니다.【F:components/rank/StartClient/index.js†L423-L509】
- 상단에는 비실시간 수동 콘솔이 포함돼 번들에 들어 있는 프롬프트 세트를 그대로 실행해 볼 수 있습니다. 토글 버튼으로 접고 펼칠 수 있고, `NonRealtimeConsole`을 내장해 초기 번들을 전달합니다.【F:components/rank/StartClient/index.js†L519-L543】
- 프롬프트 패널은 슬롯 번호·역할·연결 브릿지 조건 등을 한 카드 안에서 보여 주고, 변수 요약·최종 전달 프롬프트·원본 템플릿을 동시에 확인할 수 있게 구성돼 있습니다.【F:components/rank/StartClient/index.js†L311-L371】【F:components/rank/StartClient/index.js†L558-L571】
- 참가자 패널은 매칭된 슬롯·역할·영웅 능력과 실시간/대역 여부 같은 소스를 나열해 게임에 투입된 플레이어 구성을 빠르게 파악할 수 있게 해 줍니다.【F:components/rank/StartClient/index.js†L373-L409】【F:components/rank/StartClient/index.js†L574-L580】

## 3. Start 엔진 상태 관리
- `useStartClientEngine` 훅은 메인 게임 상태를 담당하며, 프롬프트 엔진·브릿지 그래프·배틀 로그 등 여러 엔진 모듈을 불러와 하나의 상태 머신으로 통합합니다.【F:components/rank/StartClient/useStartClientEngine.js†L1-L153】
- 메인 게임 상태는 `mainGameReducer`를 기반으로 하며, 참가자·턴·활성 변수·타임라인 로그 등 광범위한 필드를 캡슐화합니다. 훅은 `patchMainGameState`·`replaceMainGameLogs` 같은 액션 생성기를 통해 부분 업데이트를 수행합니다.【F:components/rank/StartClient/useStartClientEngine.js†L119-L199】
- 게임 번들과 매칭 메타데이터는 브릿지 조건, 사용자 페르소나, 전투 로그 초안 등을 생성하기 위한 기본 자료로 사용되며, 필요에 따라 JSON 직렬화나 슬롯 맵 구축을 거칩니다.【F:components/rank/StartClient/useStartClientEngine.js†L438-L461】【F:components/rank/StartClient/useStartClientEngine.js†L7-L38】

## 4. 실시간 서비스와 세션 라이프사이클
- 훅은 턴 타이머, 투표 컨트롤러, 실시간 세션 관리자, 난입 큐, 비동기 세션 관리자 등을 초기화해 전투 진행에 필요한 부가 서비스를 제공합니다.【F:components/rank/StartClient/useStartClientEngine.js†L336-L383】
- 실시간 스냅샷과 이벤트 로그는 `initializeRealtimeEvents`와 `appendSnapshotEvents`를 사용해 상태에 병합되며, 투표 스냅샷·난입 현황 같은 보조 상태도 함께 유지됩니다.【F:components/rank/StartClient/useStartClientEngine.js†L368-L385】【F:components/rank/StartClient/useStartClientEngine.js†L469-L477】
- `useStartSessionLifecycle`는 세션 정보 기록, 실시간 채널 스냅샷 적용, 턴 마감 시각 업데이트 등 게임 진행 중 발생하는 라이프사이클 이벤트를 조율합니다.【F:components/rank/StartClient/useStartClientEngine.js†L486-L503】
- 세션 로그 기록(`logTurnEntries`)과 드랍인 정리, API 키 오류 감지 등의 후속 로직도 같은 훅 내부에서 정의돼 있어, 전투 동안 발생하는 주요 사이드 이펙트를 한곳에서 관리합니다.【F:components/rank/StartClient/useStartClientEngine.js†L506-L520】【F:components/rank/StartClient/useStartClientEngine.js†L46-L47】

이 구조를 기반으로 메인 게임 화면은 번들 데이터와 실시간 이벤트를 결합해 전투를 진행하고, 운영자 또는 플레이어가 필요한 콘솔과 정보를 한 화면에서 확인할 수 있도록 구성됩니다.
