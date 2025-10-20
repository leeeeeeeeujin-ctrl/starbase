# Supabase Endpoint Type Inventory

엔드포인트 유형 불일치가 반복되는 이슈를 추적하기 위해 Supabase PostgREST 노출 상태를 스냅샷으로 기록합니다. 스냅샷은 `docs/troubleshooting/snapshots/` 경로에 JSON으로 저장하며, 각 엔트포인트의 스키마/리소스 종류/그랜티별 허용 메서드를 그대로 남겨둡니다.

## 스냅샷 목록

| 날짜 | 파일 | 설명 |
| --- | --- | --- |
| 2025-10-11 | [`snapshots/2025-10-11-rest-endpoints.json`](snapshots/2025-10-11-rest-endpoints.json) | PostgREST `/rest/v1` 인덱스에서 추출한 최초 엔드포인트 권한 매트릭스. |

### 사용 방법

1. 문제를 재현한 직후 PostgREST에서 동일한 덤프를 추출해 새로운 JSON 스냅샷으로 추가합니다.
2. 변경이 의심되는 엔드포인트는 스냅샷 간 diff를 확인해 권한/메서드 조합이 어떻게 달라졌는지 추적합니다.
3. 수정이 필요한 경우 Supabase SQL 마이그레이션으로 정책이나 RPC 접근 방식을 조정하고, 조정 결과를 같은 경로에 기록합니다.

> **참고:** 가능한 한 읽기/쓰기 흐름은 RPC 중심으로 재구성해 서버리스 호출을 짧고 결정적으로 만들고, 상태 동기화는 DB 락·버전·TTL과 Realtime을 결합해 다루는 것이 운영 전략에 부합합니다.
