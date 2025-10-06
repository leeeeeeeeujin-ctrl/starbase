# Game Overview Impressions

이 문서는 현재 랭킹 전투 중심의 AI Roomchat 게임이 주는 전반적 인상을 정리한 메모입니다.

## 전체 톤 & 테마
- **경쟁 지향 SF 스타디움**: 네이밍과 UI 요소가 "랭크", "슬롯", "세션" 등 토너먼트 운영 용어로 가득하여 e스포츠식 경쟁장을 연상시킵니다. `StartClient`의 다크 톤 배경과 승수/쿨다운 배너 표현은 현장 운영 콘솔 느낌을 강조합니다.【F:components/rank/StartClient/index.js†L1-L218】【F:components/rank/StartClient/StartClient.module.css†L64-L215】
- **운영자/플레이어 혼합 시점**: 게임 방 UI가 참가자 스트립, 로그, 조건 설명을 동시에 노출해 플레이어와 운영자가 같은 화면에서 상태를 관리하도록 설계되었습니다.【F:components/rank/GameRoomView.js†L894-L1205】

## 핵심 경험 흐름
1. **매칭 & 슬롯 확보**
   - 솔로/듀오/캐주얼 모드마다 `AutoMatchProgress`가 대기, 슬롯 배정, 즉시 전투 실행까지 자동화해 “줄 서서 입장 → 바로 전투”라는 역동적 템포를 만듭니다.【F:components/rank/AutoMatchProgress.js†L220-L812】
   - 슬롯은 역할별로 쿼터가 나뉘어 있고, 타임아웃이나 중도 이탈 시 자동 스위퍼가 청소하는 등 경쟁 구좌를 빡빡하게 관리합니다.【F:lib/rank/slotCleanup.js†L1-L245】
2. **세션 진행 & 로그 시청**
   - `StartClient` 엔진이 Supabase 번들을 불러와 턴 기반 전투를 실행하고, 조건/브리지 메시지를 자연어로 설명해줍니다. 덕분에 복잡한 프롬프트 그래프가 운영 패널에서 곧바로 읽혀 “전략 AI 교전” 느낌이 납니다.【F:components/rank/StartClient/useStartClientEngine.js†L780-L1059】
   - 공용 히스토리는 `/api/rank/sessions`로 묶여 로비 패널에 공유되어, 방에 늦게 합류한 플레이어도 상황을 빠르게 파악할 수 있게 합니다.【F:pages/api/rank/sessions.js†L1-L144】【F:components/rank/GameRoomView.js†L1000-L1205】
3. **결과 & 랭킹 반영**
   - 전투 후에는 역할별 리더보드, 시즌 스냅샷, 배틀 로그가 한 화면에 정리되어, “경기를 치르고 곧바로 성적을 확인”하는 루프가 선명합니다.【F:components/rank/GameRoomView.js†L915-L1007】【F:components/rank/LeaderboardDrawer.js†L1-L409】

## 감성 요약
- **하드코어 운영 콘솔**: 단순 게임 플레이보다는, 운영자와 상위권 플레이어가 함께 쓰는 실시간 관제실을 연상케 합니다. 승수 조건, 브리지 조건을 세세히 풀어주어 “AI 전략을 직접 조율한다”는 몰입감을 줍니다.
- **AI 배틀러의 라이브 이벤트**: 세션 기록과 드롭인/쿨다운 같은 실시간 이벤트가 강조되어, AI 캐릭터가 참여하는 라이브 쇼/경기장을 지켜보는 경험처럼 느껴집니다.
- **지속적 성장 & 관리**: 쿨다운 모니터링, API 키 보고, 자동 슬롯 청소 등 장기 운영을 위한 백엔드 체계가 촘촘해, 단발성 게임이 아니라 시즌제 리그를 돌리는 플랫폼이라는 인상을 남깁니다.【F:lib/rank/apiKeyCooldown.js†L3-L73】【F:pages/api/rank/cooldown-report.js†L1-L79】

## 앞으로 기대되는 완성도 향상 포인트
- 전투 결과가 점수 및 랭킹에 반영되는 부분은 아직 일부 스텁으로 남아 있어, 향후 스코어 동기화가 마무리되면 경쟁 감각이 더 명확해질 것으로 보입니다.【F:docs/rank-game-roadmap.md†L33-L78】
- 세션 히스토리와 공유 로그의 시각화가 확장되면, 관전 경험이 더욱 극적으로 느껴질 여지가 큽니다.【F:docs/rank-game-roadmap.md†L108-L150】

