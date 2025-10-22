# Game Logic Modules

게임 로직을 순수 함수 기반으로 모듈화한 시스템입니다.

## 📁 구조

```
components/game/logic/
├── GameEngine.js       # 게임 루프, 상태 관리, 노드 실행
├── PhysicsEngine.js    # 물리 엔진 (충돌, 중력, 이동)
├── EntityManager.js    # 엔티티 관리 시스템
├── ScoreManager.js     # 점수, 진행도, 업적 관리
└── index.js           # 중앙 내보내기
```

## 🎮 GameEngine

게임의 핵심 상태와 로직을 관리합니다.

### 주요 기능
- ✅ 순수 함수 기반 상태 관리 (불변성 유지)
- ✅ 템플릿 컴파일 (변수 치환, 조건문, 반복문)
- ✅ 노드 시스템 (게임 플로우 제어)
- ✅ 조건 평가 (키워드, 변수, 복합 조건)
- ✅ 60 FPS 성능 모니터링
- ✅ 저사양 디바이스 최적화

### 사용 예시

```javascript
import * as GameEngine from './logic/GameEngine';

// 게임 상태 초기화
const state = GameEngine.initializeGameState({
  nodes: [
    { id: 'start', type: 'ai', isStart: true },
    { id: 'next', type: 'user_action' }
  ],
  variables: { '{{player}}': 'Hero' }
});

// 템플릿 컴파일
const compiled = GameEngine.compileTemplate(
  'Hello {{player}}!',
  state.variables
);

// 게임 시작
const started = GameEngine.startGame(state);
```

## 🎯 PhysicsEngine

2D 물리 시뮬레이션을 제공합니다.

### 주요 기능
- ✅ 벡터 연산 (더하기, 빼기, 곱하기, 정규화)
- ✅ 중력, 속도, 가속도 시뮬레이션
- ✅ 충돌 감지 (AABB, 원형)
- ✅ 충돌 응답 (탄성 충돌)
- ✅ 경계 제약
- ✅ 공간 분할 최적화
- ✅ 레이캐스팅

### 사용 예시

```javascript
import * as PhysicsEngine from './logic/PhysicsEngine';

// 물리 객체 생성
const player = PhysicsEngine.createPhysicsObject({
  x: 100,
  y: 100,
  mass: 1,
  radius: 20
});

// 중력 적용 및 업데이트
let updated = PhysicsEngine.applyGravity(player);
updated = PhysicsEngine.updateVelocity(updated);
updated = PhysicsEngine.updatePosition(updated);

// 충돌 감지
const enemy = PhysicsEngine.createPhysicsObject({
  x: 120,
  y: 100,
  radius: 20
});

if (PhysicsEngine.checkCollision(player, enemy)) {
  const { obj1, obj2 } = PhysicsEngine.resolveCollision(player, enemy);
}
```

## 🎭 EntityManager

게임 내 모든 엔티티를 관리합니다.

### 주요 기능
- ✅ 엔티티 생성/추가/제거/업데이트
- ✅ 타입별, 태그별 인덱싱
- ✅ 공간 쿼리 (범위 검색, 최근접 검색)
- ✅ 데미지/힐링 시스템
- ✅ 상태 효과 관리
- ✅ 불변성 보장

### 사용 예시

```javascript
import * as EntityManager from './logic/EntityManager';

// 컨테이너 생성
let container = EntityManager.createEntityContainer();

// 엔티티 생성 및 추가
const player = EntityManager.createEntity({
  type: EntityManager.ENTITY_TYPES.PLAYER,
  name: 'Hero',
  health: 100,
  x: 0,
  y: 0
});

container = EntityManager.addEntity(container, player);

// 데미지 적용
const result = EntityManager.applyDamage(container, player.id, 30);
container = result.container;

// 가까운 엔티티 찾기
const nearest = EntityManager.findNearestEntity(
  container,
  { x: 50, y: 50 },
  { type: EntityManager.ENTITY_TYPES.ENEMY }
);
```

## 🏆 ScoreManager

점수, 진행도, 업적을 관리합니다.

### 주요 기능
- ✅ 점수 추가/차감/초기화
- ✅ 하이스코어 추적
- ✅ 진행도 추적 및 체크포인트
- ✅ 콤보 시스템 (타임아웃 포함)
- ✅ 업적 시스템
- ✅ 통계 추적
- ✅ 보상 시스템

### 사용 예시

```javascript
import * as ScoreManager from './logic/ScoreManager';

// 상태 초기화
let state = ScoreManager.initializeScoreState({
  totalProgress: 100
});

// 점수 추가
state = ScoreManager.addScore(state, 100);

// 콤보 증가
state = ScoreManager.increaseCombo(state);
state = ScoreManager.addScore(state, 50, { applyCombo: true });

// 업적 추가
const achievement = ScoreManager.createAchievement({
  id: 'first_win',
  name: 'First Victory',
  requirementValue: 1
});

state = ScoreManager.addAchievement(state, achievement);

// 업적 진행도 업데이트
const result = ScoreManager.updateAchievementProgress(
  state,
  'first_win',
  1
);

if (result.unlocked) {
  console.log('Achievement unlocked!');
}
```

## 🔧 설계 원칙

### 1. 순수 함수
모든 함수는 부작용이 없으며, 같은 입력에 대해 항상 같은 출력을 반환합니다.

```javascript
// ✅ 좋은 예: 순수 함수
const newState = GameEngine.updateGameState(state, { score: 100 });

// ❌ 나쁜 예: 부작용 있음
state.score = 100;
```

### 2. 불변성
상태는 직접 수정하지 않고 항상 새로운 객체를 반환합니다.

```javascript
// ✅ 좋은 예: 불변성 유지
const updated = { ...state, score: state.score + 10 };

// ❌ 나쁜 예: 직접 수정
state.score += 10;
```

### 3. 성능 최적화
- 60 FPS 유지
- 저사양 디바이스 감지 및 최적화
- 공간 분할을 통한 충돌 감지 최적화

```javascript
// 저사양 디바이스 감지
if (GameEngine.isLowEndDevice()) {
  // 프레임 레이트 조정
  const interval = GameEngine.getFrameInterval(30); // 30 FPS로 제한
}
```

## 🧪 테스트

모든 모듈은 포괄적인 테스트를 포함합니다.

```bash
npm test -- __tests__/components/game/logic
```

### 테스트 커버리지
- **GameEngine**: 40+ 테스트
- **PhysicsEngine**: 35+ 테스트
- **EntityManager**: 45+ 테스트
- **ScoreManager**: 50+ 테스트

**총 170+ 테스트 케이스**

## 📊 성능 특성

- **메모리**: 불변 데이터 구조로 메모리 효율적
- **속도**: 공간 분할로 O(n²) → O(n) 충돌 감지
- **호환성**: IE11+, Safari 12+, Chrome 70+, Firefox 65+

## 🔗 통합

`UnifiedGameSystem.js`에서 사용:

```javascript
import * as GameEngine from './logic/GameEngine';
import * as ScoreManager from './logic/ScoreManager';

// 템플릿 컴파일
const compiled = GameEngine.compileTemplate(template, variables);

// 조건 평가
const result = GameEngine.evaluateCondition(condition, response, variables);

// 다음 노드 찾기
const nextNode = GameEngine.findNextNode(state, currentNode, response);
```

## 📝 라이센스

이 모듈은 프로젝트의 라이센스를 따릅니다.
