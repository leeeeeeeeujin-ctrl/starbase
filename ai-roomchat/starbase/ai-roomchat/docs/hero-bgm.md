# Hero BGM Reference

## hero_bgms 테이블 개요

- **테이블 이름**: `public.hero_bgms`
- **생성 위치**: `supabase.sql`에 포함되어 있어 별도 수작업으로 만들 필요가 없습니다. `supabase db push` 또는 `psql -f supabase.sql`로 적용하면 자동 생성됩니다.
- **컬럼**
  | 컬럼 | 타입 | 설명 |
  | --- | --- | --- |
  | `id` | `uuid` | 기본 키. 자동으로 `gen_random_uuid()` 사용 |
  | `hero_id` | `uuid` | 연관된 영웅(`heroes.id`) 외래 키. 영웅이 삭제되면 함께 삭제됩니다. |
  | `label` | `text` | 브금 종류(예: 기본, 전투 등) 라벨. 기본값은 `"기본"`. |
  | `url` | `text` | 공개 재생 URL. 업로드 시 Supabase Storage의 public URL을 저장합니다. |
  | `storage_path` | `text` | Storage 버킷 내부 경로. 필요 시 파일 정리에 사용합니다. |
  | `duration_seconds` | `integer` | 트랙 길이(초). 메타데이터를 읽을 수 없으면 비워둘 수 있습니다. |
  | `mime` | `text` | 오디오 MIME 타입. |
  | `sort_order` | `integer` | 노출·재생 순서. 0이 대표 트랙입니다. |
  | `created_at` / `updated_at` | `timestamptz` | 생성·갱신 시각. 기본값은 `now()` |

- **Row Level Security**: `supabase.sql`에서 소유자 기준으로 SELECT/INSERT/UPDATE/DELETE 정책이 설정되어 있습니다.
- **인덱스**: `(hero_id, sort_order, created_at)` 복합 인덱스로 영웅별 정렬 조회가 최적화됩니다.

## 서비스 레이어 연동

- `services/heroes.js`에는 다중 트랙 로드를 위한 `fetchHeroBgms`, 저장을 위한 `syncHeroBgms` 등이 이미 구현되어 있습니다. `normaliseHero`가 첫 트랙을 `hero.bgm_url`로 되돌려 UI와 호환되도록 처리합니다.
- 에디터에서 업로드한 오디오는 `supabase.storage.from('heroes')` 버킷에 저장되며, 저장 직후 `syncHeroBgms` 호출로 테이블이 최신 상태로 유지됩니다.

## 브금 플레이어

- 캐릭터 화면 하단 오버레이는 **설정 탭에서 브금 제어를 켜둔 경우**에만 상단에 BGM 컨트롤러를 표시합니다.
- 플레이어 기능
  - 재생/일시정지, 정지, 처음으로 이동, 다음 곡(트랙이 여러 개일 때), 현재 곡 반복 토글.
  - 진행도 바를 터치/드래그해 원하는 구간으로 이동할 수 있으며, 좌·우 방향키로도 2% 단위로 이동합니다.
  - 진행 시간·총 시간을 한눈에 보여 주며, 길이를 알 수 없는 트랙은 `??:??`로 표기합니다.

이 문서를 참고하면 브금 스키마를 따로 만들 필요가 없고, 기존 스크립트와 서비스 코드를 그대로 활용해 다중 트랙 브금 워크플로를 확장할 수 있습니다.
