# MatchContext 스펙 (Start Client)

## 목적
- 매칭에서 전달된 역할·슬롯·프롬프트 메타데이터를 단일 객체로 집계해 Start 클라이언트 엔진이 참조하도록 합니다.
- Supabase에서 가져온 최신 참가자/프롬프트 정보와 세션 스토리지의 매칭 메타를 병합합니다.

## 구조 개요
| 필드 | 설명 |
| --- | --- |
| `game` | `rank_games`에서 로드한 원본 게임 행. |
| `graph` | 프롬프트 슬롯/브리지로 구성된 그래프(`nodes`, `edges`). |
| `participants` | 슬롯 정규화 결과 배열. 역할/소유자/슬롯 번호가 매칭 결과와 일치하도록 재정렬합니다. |
| `slots` | `promptEngine.buildSlotsFromParticipants`로 생성한 최종 슬롯 정보. |
| `promptSet` | `prompt_set_id` 중심의 요약 정보(`id`, `label`, `version`). |
| `matching` | 매칭 메타데이터(`assignments`, `matchType`, `turnTimer` 등) 정규화 결과. |
| `roles` | 매칭 메타 또는 참가자 목록에서 파생한 역할/슬롯 요약. |
| `warnings` | 프롬프트/슬롯 정합성 검사에서 발생한 경고 목록. |

## 정규화 규칙
1. **Hero / Owner 우선 매칭**
   - `assignments.heroIds` → `participants.hero_id` 순으로 매칭합니다.
   - 미일치 시 `owner_id`, 역할명 순으로 대체합니다.
   - 모든 조건이 불충족하면 아직 사용되지 않은 참가자 중 첫 번째를 할당합니다.

2. **중복 방지**
   - 매칭된 참가자는 `Set`으로 추적해 한 번만 소비합니다.
   - 남은 참가자가 있다면 순서대로 후속 슬롯에 채워 중복 배정을 차단합니다.

3. **플레이스홀더 생성**
   - 어떤 기준으로도 참가자를 찾지 못하면 `미배정 슬롯` 플레이스홀더를 추가하고 경고를 기록합니다.

4. **프롬프트 경고 수집**
   - `loadGameBundle` 경고 문자열을 `prompt_meta` 타입으로 승격합니다.
   - 슬롯 정규화 중 발생한 경고는 `slot_mismatch` 타입으로 노출합니다.

## 훅 연계
- `useMatchContextLoader`가 Supabase 번들을 로드하고 `MatchContext`를 생성합니다.
- `useStartClientEngine`은 이 컨텍스트로 `game`/`participants`/`graph` 상태를 갱신하고, `warnings`를 사용자 배너로 전달합니다.

## TODO
- `MatchContext`를 Turn Engine 컨트롤러에도 주입해 `startMatchMetaRef` 의존도를 제거합니다.
- 플레이스홀더 슬롯에 대한 UI 표시 및 로그 포맷 정의가 필요합니다.
