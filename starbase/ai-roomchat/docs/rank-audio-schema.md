# 히어로 오디오 프리셋 스키마 제안

자동 전투 화면에서 상대가 저장한 이퀄라이저·리버브·컴프레서 설정을 그대로 재생하려면
히어로별로 다음 컬럼이 필요합니다. (모두 `public.heroes` 테이블 기준)

| 컬럼명 | 타입 | 설명 |
| --- | --- | --- |
| `audio_eq` | `jsonb` | `{ "enabled": true, "low": -2.5, "mid": 1.5, "high": 3 }` 형식으로 저장. 미지정 시 `null`. |
| `audio_reverb` | `jsonb` | `{ "enabled": true, "mix": 0.35, "decay": 2.4 }` 형식. `mix`는 0~1, `decay`는 초 단위. |
| `audio_compressor` | `jsonb` | `{ "enabled": true, "threshold": -24, "ratio": 3.2, "release": 0.28 }` 형식. |

## 마이그레이션 예시
```sql
alter table public.heroes
  add column if not exists audio_eq jsonb,
  add column if not exists audio_reverb jsonb,
  add column if not exists audio_compressor jsonb;
```

## 저장 규칙
- 프론트엔드에서 설정 토글이 꺼져 있으면 `enabled: false`로 저장하거나 `null`을 입력합니다.
- 값은 모두 실수형으로 직렬화하며, 허용 범위를 벗어나는 입력은 저장 전에 클램프(예: EQ ±12dB)합니다.
- 기존 데이터에는 영향이 없도록 기본값을 `null`로 두고, UI가 값을 덮어쓸 때만 JSON을 기록합니다.

## 읽기 규칙
- `audio_eq.enabled`가 `true`일 때만 EQ를 활성화하고, 나머지 값이 없으면 0dB로 간주합니다.
- 리버브 `mix`는 기본 0.3, `decay`는 1.8초를 사용하며, `audio_reverb.enabled`가 `false`이면 효과를 끕니다.
- 컴프레서는 `threshold`(dB), `ratio`, `release`(초)를 사용하며, 값이 없으면 `-28dB / 2.5 / 0.25s`로 초기화합니다.

이 컬럼을 추가하면 `StartClient`가 상대방 프리셋을 실시간으로 적용해 동일한 사운드 경험을 제공할 수 있습니다.
