# Maker JSON Schema Reference

이 문서는 Maker에서 내보내거나 가져오는 프롬프트 세트 JSON 번들의 구조를 정리한다. `useMakerHome`과 `insertPromptSetBundle()`이 처리하는 필드를 기준으로 작성했으며, 변수 규칙 버전 업그레이드 및 슬롯 브리지 재매핑 규칙을 포함한다.

## 1. 번들 개요

Maker JSON은 다음 세 개의 루트 키를 가진다.

| 키        | 타입            | 설명                                                                                                                                                                                                                    |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`    | `object`        | 세트 버전·변수 규칙 버전, 마지막으로 저장한 제작자 등 메타데이터. `variableRulesVersion` 또는 `version` 필드가 존재하면 Maker가 버전을 추적한다.【F:hooks/maker/useMakerHome.js†L108-L153】                             |
| `set`     | `object`        | Supabase `prompt_sets` 테이블에 대응하는 기본 정보(`name`, `description`, `owner_id`, `prompt_set_id` 등). 가져오기 시 이름만 사용되고, 나머지는 DB에서 재생성된다.【F:lib/maker/promptSets/bundle.js†L59-L96】         |
| `slots`   | `array<object>` | 각 슬롯 정의. 번호, 템플릿, 가시성, 변수 규칙, 그래프 좌표 등이 포함된다. Maker는 여기서 필수 필드만 사용해 새 슬롯을 삽입한다.【F:lib/maker/promptSets/bundle.js†L7-L58】【F:lib/maker/promptSets/bundle.js†L98-L140】 |
| `bridges` | `array<object>` | 슬롯 연결(브리지) 정보. 슬롯 ID는 가져오기 시 새로 삽입된 ID로 재매핑된다.【F:lib/maker/promptSets/bundle.js†L142-L191】                                                                                                |

## 2. 메타데이터 필드

- `variableRulesVersion` / `version`: 숫자 버전. Maker는 `useMakerHome`에서 파일을 가져올 때 이 값을 검사해 최신 변수 규칙(현재 2)인지 확인하고, 구버전이면 공지 배너로 재저장을 안내한다.【F:hooks/maker/useMakerHome.js†L108-L178】
- `savedAt`, `updatedAt`: 가져오기 시에는 참고 정보로만 사용된다. DB에는 영향을 주지 않는다.
- `createdBy`, `updatedBy`: 텍스트 값. 추후 감사 로그 확장 시 참고용으로 남길 수 있다.

## 3. 슬롯 구조

`slots` 배열의 각 객체는 `normalizeSlotPayload()`를 거쳐 Supabase `prompt_slots` 테이블에 삽입된다.【F:lib/maker/promptSets/bundle.js†L7-L58】 필드 의미는 다음과 같다.

| 필드                                                       | 타입               | 기본값        | 설명                                                                                                             |
| ---------------------------------------------------------- | ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `slot_no` (`slot_no`, `slotNo`, `slot_index`, `slotIndex`) | `number`           | 배열 인덱스   | 슬롯 고유 번호. 미지정 시 순서대로 자동 배정된다.                                                                |
| `slot_type` (`slot_type`, `slotType`)                      | `string`           | `'ai'`        | 슬롯 유형. AI 슬롯/플레이어 슬롯 구분에 사용한다.                                                                |
| `slot_pick` (`slot_pick`, `slotPick`)                      | `string`           | `'1'`         | 슬롯 픽 규칙. 기본값 `'1'`은 단일 응답, `'all'`은 병렬 실행 등으로 확장될 수 있다.                               |
| `template`                                                 | `string`           | `''`          | 실제 프롬프트. 문자열 그대로 저장된다.                                                                           |
| `is_start` (`is_start`, `isStart`)                         | `boolean`          | `false`       | 진입 슬롯 여부. StartClient가 초기 슬롯을 계산할 때 사용한다.                                                    |
| `invisible`                                                | `boolean`          | `false`       | 그래프에서 숨김 처리할지 여부.                                                                                   |
| `visible_slots` (`visible_slots`, `visibleSlots`)          | `number[]`         | `[]`          | 슬롯 실행 시 노출할 다른 슬롯 목록. 숫자로 정규화된다.                                                           |
| `canvas_x`, `canvas_y`                                     | `number` \/ `null` | `null`        | Maker 그래프 좌표. `position.x/y`가 있을 경우 이를 사용한다.                                                     |
| `var_rules_global` (`var_rules_global`, `varRulesGlobal`)  | `object`           | 정규화된 규칙 | `sanitizeVariableRules()`로 최신 스키마에 맞게 정리된 전역 변수 규칙.【F:lib/maker/promptSets/bundle.js†L7-L58】 |
| `var_rules_local` (`var_rules_local`, `varRulesLocal`)     | `object`           | 정규화된 규칙 | 슬롯 전용 변수 규칙.                                                                                             |

### 슬롯 식별자

- `id`, `slot_id`: 가져오기 시 원본 슬롯 ID. Maker는 이를 `slotIdMap`으로 저장했다가 브리지 재매핑에 사용한다.【F:lib/maker/promptSets/bundle.js†L104-L140】
- `identifier`: `slot.id` 또는 `slot_no`에서 파생된 값. 신규 슬롯 삽입 후 `slotIdMap`에 매핑되어 브리지 참조에 사용된다.

## 4. 브리지 구조

`bridges` 배열은 슬롯 간 조건부 이동을 정의한다. 가져오기 시 `remapSlotIdFactory()`가 새 슬롯 ID로 치환한다.【F:lib/maker/promptSets/bundle.js†L104-L191】

| 필드                                                    | 타입       | 설명                                        |
| ------------------------------------------------------- | ---------- | ------------------------------------------- |
| `from_slot_id`, `to_slot_id` (`fromSlotId`, `toSlotId`) | `string`   | 연결 시작/종료 슬롯 ID. 새 ID로 재매핑된다. |
| `trigger_words` (`triggerWords`)                        | `string[]` | 조건부 실행 키워드.                         |
| `conditions`                                            | `object[]` | 조건 검사 배열. 미지정 시 빈 배열.          |
| `priority`                                              | `number`   | 실행 우선순위. 기본값 0.                    |
| `probability`                                           | `number`   | 실행 확률. 기본값 1.                        |
| `fallback`                                              | `boolean`  | 실패 시 대체 경로인지 여부.                 |
| `action`                                                | `string`   | 브리지 행동(예: `'continue'`, `'branch'`).  |

## 5. 입출력 흐름 요약

1. **내보내기**: `readPromptSetBundle(id)`가 `prompt_sets`, `prompt_slots`, `prompt_bridges`를 동시에 읽어 JSON을 구성한다. 변수 규칙은 내보낼 때도 `sanitizeVariableRules()`로 최신화된다.【F:lib/maker/promptSets/bundle.js†L59-L102】
2. **가져오기**: `useMakerHome`이 파일을 읽고 버전을 확인한 뒤 `insertPromptSetBundle(userId, payload)`로 전달한다. 이 함수가 세트를 생성하고 슬롯·브리지를 순차 삽입한다.【F:hooks/maker/useMakerHome.js†L108-L193】【F:lib/maker/promptSets/bundle.js†L76-L191】
3. **버전 안내**: 가져온 JSON의 버전이 최신이 아니면 Maker 홈 상단에 "가져온 세트를 다시 저장하세요" 배너가 표시되고, `VARIABLE_RULES_VERSION` 차이를 안내한다.【F:hooks/maker/useMakerHome.js†L108-L178】

## 6. 체크리스트

- [x] JSON에 `meta.variableRulesVersion` 또는 `meta.version`이 포함되어 있는가?
- [x] 슬롯 객체가 최소한 `slot_no`, `template`, `var_rules_global/local`을 포함하는가?
- [x] 브리지 객체에서 참조하는 슬롯 ID가 모두 존재하는가?
- [ ] 새 스키마 필드를 추가했다면 `normalizeSlotPayload()`와 Supabase `prompt_slots` 테이블 DDL을 동시에 갱신했는가?

## 7. 추가 메모

- Maker는 현재 JSON 유효성 검사를 클라이언트에서만 수행한다. 장기적으로는 `/api/maker/import` 같은 Edge Function을 도입해 서버 측에서도 스키마 검증을 수행할 계획이다.
- Prompt Set 버전 문서는 [프롬프트 세트 재저장 가이드](./rank-prompt-set-versioning-guide.md)와 함께 참고하면 된다.

---

느낀 점: Maker JSON 구조를 명문화함으로써 Edge Function·백엔드 검증 구현 시 참조할 수 있는 기준이 마련됐다.
추가로 필요한 점: 서버 Edge Function에서도 동일한 스키마를 재사용해, 클라이언트-서버 간 검증 메시지를 일치시킬 필요가 있다.
진행사항: Maker JSON 번들의 메타/슬롯/브리지 구조와 버전 처리 규칙을 문서화하고, 클라이언트에서 `zod` 기반 1차 검증을 수행하도록 보강했다.
