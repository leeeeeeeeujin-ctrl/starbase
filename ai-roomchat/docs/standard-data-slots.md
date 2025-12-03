# Standard data slots (`stats`, `scene`, `effects`, `speaker`)

이 문서는 텍스트 런타임에서 공통으로 사용하는 **표준 데이터 슬롯**을 정리한다.  
장르(텍스트 배틀, 카드 게임, 퍼즐 등)에 상관없이, 아래 슬롯을 채워두면
GameShell / UI Shell 위젯들이 재사용 가능한 정보를 얻을 수 있다.

> 이 문서는 `WORKSPACE_EDITOR_RUNTIME.md` 10.x / 17.x 에서 요약으로 언급되는  
> `variables.stats / scene / effects / speaker` 의 상세 버전이다.

## 1. 공통 구조

모든 슬롯은 `ctx.variables` 아래에 존재한다.

- `variables.stats: object`
  - 숫자 기반 지표를 모아 두는 공간.
  - 예시 필드:
    - `turn`: 현재 턴 번호
    - `heroHp`, `rivalHp`
    - `heroScore`, `rivalScore`
    - `timeRemaining`, `combo`, `streak` …
- `variables.scene: object`
  - 현재 장면을 한 줄로 요약하거나, 배경/브금 키를 담는 공간.
  - 예시 필드:
    - `summary`: 직전 장면 요약 텍스트
    - `backgroundKey`: 배경 이미지/레이어 식별자
    - `bgmKey`: 브금/사운드 트랙 식별자
- `variables.effects: object`
  - 현재 적용 중인 효과 목록.
  - 표준 필드:
    - `active: Effect[]`
    - 각 Effect 예시:
      ```json
      {
        "id": "burn",
        "target": "hero|rival|all",
        "kind": "buff|debuff|status",
        "label": "불타는 중",
        "value": -5,
        "durationTurns": 2
      }
      ```
- `variables.speaker: object`
  - 직전 발화자(또는 현재 장면의 주인공)를 가리키는 간단한 구조.
  - 예시 필드:
    - `ownerId`: 랭크/유저 소유자 id
    - `heroId`: 캐릭터 id
    - `role`: `"hero" | "rival" | "npc" | "narrator" …`
    - `accentColor`: UI에서 사용할 포인트 색상 (ex. `#60a5fa`)
    - `avatarUrl`: 말풍선/초상화에 쓸 이미지 URL

각 게임은 위 필드를 **자유롭게 확장**할 수 있지만,  
UI Shell 위젯/템플릿은 위 기본 필드들이 있을 때 최대로 활용되도록 설계한다.

## 2. 헬퍼(`standardSlots.js`) – 호스트/런타임용

경로: `ai-roomchat/lib/runtime/standardSlots.js`

```js
import {
  ensureStandardSlots,
  updateStandardSlots,
} from '@/lib/runtime/standardSlots';
```

### 2.1 `ensureStandardSlots(ctx)`

- 역할:
  - `ctx.variables.stats / scene / effects / speaker` 를 **항상 객체/배열 상태**로 보장한다.
  - `effects.active` 가 배열이 아니면 빈 배열로 초기화한다.
- 반환값:

```ts
{
  vars: object;      // ctx.variables (참조)
  stats: object;     // vars.stats
  scene: object;     // vars.scene
  effects: object;   // vars.effects
  speaker: object;   // vars.speaker
}
```

### 2.2 `updateStandardSlots(ctx, patch)`

- 역할:
  - 위 슬롯들에 **부분 업데이트**를 적용하는 편의 함수.
  - 내부적으로 `ensureStandardSlots(ctx)` 를 호출한 뒤, 전달된 값을 얕게 병합한다.
- 시그니처:

```ts
updateStandardSlots(ctx, {
  stats?: object;
  scene?: object;
  effects?: object | any[];
  speaker?: object;
  variables?: object; // 추가 top-level 변수 병합용
});
```

- 사용 예시:

```js
updateStandardSlots(ctx, {
  stats: {
    turn: ctx.turn,
    heroScore,
    rivalScore,
  },
  scene: {
    summary: narrativeText,
    backgroundKey: 'arena.night',
  },
  effects: {
    active: parsedEffects,
  },
  speaker: {
    ownerId: heroOwnerId,
    heroId,
    role: 'hero',
    accentColor: '#60a5fa',
  },
});
```

> NOTE  
> `/game/hooks/automation.js` 는 샌드박스(Function) 로 실행되므로  
> 여기에서 `standardSlots.js` 를 직접 `import` 할 수는 없다.  
> 훅 내부에서는 동일한 규칙을 **가볍게 복제**해서 사용하는 형태를 유지하고,
> 서버 API나 Rank 연동 코드에서 위 헬퍼를 활용하는 패턴을 권장한다.

### 2.3 coreRuntime 와의 연동 (`stats.turn`)

- `coreRuntime.step()` 과 `coreRuntime.getContextSnapshot()` 은
  내부에서 `updateStandardSlots(ctx, { stats: { turn: ctx.turn } })` 를 호출한다.
  - 즉, 런타임이 턴을 하나 진행할 때마다 `variables.stats.turn` 이 항상
    최신 턴 번호로 갱신된다.
- 호스트 코드(플래이 오버레이, StartClient 등)는 이 값을 그대로
  - 턴 로그(summary / rank_turns),
  - 타임라인 이벤트,
  - UI Shell 위젯(statMeter 등)
  에서 재사용할 수 있다.
- 그 외의 필드(`heroScore`, `scene.summary`, `effects.active`, `speaker.*`) 는
  여전히 훅/호스트 코드가 `updateStandardSlots` 를 통해 필요에 따라 채워야 한다.

## 3. 장르 예시 – 텍스트 배틀

`docs/examples/text-battle-basic/game.hooks.automation.js` 에서는 AI 판정 결과를
다음과 같이 표준 슬롯에 반영한다.

- `stats.turn`, `stats.heroScore`, `stats.rivalScore`
- `scene.summary` – 직전 판정의 내러티브
- `effects.active` – judges 응답에서 넘어온 효과 리스트
- `speaker.role`, `speaker.accentColor` – 승자 기준 발화자 정보

이 구조는 텍스트 배틀에 한정된 것이 아니라,  
다른 장르에서도 그대로 재사용할 수 있는 **예시 패턴**이다.

예를 들어:

- 카드 게임: `stats.heroHp`, `stats.mana`, `effects.active` 에 필드 효과/버프를 기록.
- 퍼즐 게임: `stats.combo`, `stats.timeRemaining`, `scene.summary` 에 현재 스테이지 설명.
- 협동 모드: `speaker.ownerId` / `speaker.heroId` 로 현재 발화자를 지정.

UI Shell 위젯(chatLog, heroCard, statMeter 등)은 이 슬롯들을 읽어서  
장르에 관계없이 일관된 UI를 렌더링할 수 있다.
