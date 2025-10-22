# UnifiedGameSystem - Modular Architecture

## 개요
UnifiedGameSystem은 모듈화된 게임 시스템으로, 각 기능을 독립적인 모듈로 분리하여 관리합니다.

## 아키텍처

### 오케스트레이션 레이어
**UnifiedGameSystem.js** - 메인 컴포넌트
- 모든 모듈을 초기화하고 조율
- 생명주기 관리 (initialize, update, cleanup)
- 이벤트 버스를 통한 모듈 간 통신
- React 상태와 게임 상태 동기화

### 모듈 구조

#### 렌더링 모듈 (renderers/)
1. **GameRenderer.js**
   - 게임 캔버스 렌더링
   - 배경, 캐릭터, 엔티티 렌더링
   - 캔버스 관리 및 리사이징

2. **UIRenderer.js**
   - UI 오버레이 렌더링
   - HUD, 메뉴, 대화 상자
   - DOM 기반 UI 요소 관리

3. **EffectsRenderer.js**
   - 시각 효과 렌더링
   - 파티클, 플래시, 흔들림 효과
   - 효과 수명 주기 관리

#### 입력 모듈 (input/)
1. **InputManager.js**
   - 키보드, 마우스, 터치 입력 처리
   - 입력을 게임 액션으로 변환
   - 입력 큐 관리
   - 이벤트 리스너 시스템

#### 로직 모듈 (logic/)
1. **GameEngine.js**
   - 핵심 게임 로직
   - 게임 루프 관리
   - 게임 상태 (phase, turn) 관리
   - 시작, 일시정지, 정지 제어

2. **PhysicsEngine.js**
   - 물리 계산
   - 충돌 감지 (AABB)
   - 중력, 속도, 마찰 적용
   - 레이캐스트

3. **EntityManager.js**
   - 엔티티 생성, 업데이트, 제거
   - 엔티티 쿼리 (타입별, 위치별)
   - 엔티티 간 거리 계산
   - 수명 주기 관리

4. **ScoreManager.js**
   - 점수 관리
   - 통계 기록
   - 업적 시스템
   - 최고 점수 추적

## 생명주기

### 초기화 (initialize)
```javascript
// 1. 호환성 체크
await CompatibilityManager.initialize()

// 2. 모듈 초기화
await initializeModules()

// 3. 캐릭터 변수 등록
registerCharacterVariables(initialCharacter)

// 4. 게임 템플릿 로드
await loadGameTemplate(gameTemplateId)
```

### 업데이트 (update)
```javascript
// 게임 루프 (requestAnimationFrame)
function updateGameLoop() {
  // 1. GameEngine 업데이트
  const deltaTime = gameEngine.update()
  
  // 2. EntityManager 업데이트
  entityManager.updateAll(deltaTime)
  
  // 3. PhysicsEngine 업데이트
  physicsEngine.update(deltaTime, entities)
  
  // 4. 렌더링
  gameRenderer.render(gameData)
  uiRenderer.render(gameData, executionState)
  effectsRenderer.render(deltaTime)
}
```

### 정리 (cleanup)
```javascript
// 모든 모듈 정리
cleanupModules()

// 리소스 해제
mobileManager.cleanup()
gameResourceManager.cleanup()
```

## 이벤트 버스

모듈 간 통신을 위한 pub/sub 패턴 구현:

### 이벤트 종류
- `node:start` - 노드 실행 시작
- `node:complete` - 노드 실행 완료
- `node:error` - 노드 실행 오류
- `input:required` - 사용자 입력 필요
- `input:action` - 사용자 액션 발생
- `game:end` - 게임 종료

### 사용 예
```javascript
// 이벤트 리스닝
eventBus.current.on('node:complete', (data) => {
  console.log('Node completed:', data)
})

// 이벤트 발송
eventBus.current.emit('node:complete', { nodeId, response })
```

## 하위 호환성

### Props 인터페이스 유지
```javascript
<UnifiedGameSystem
  initialCharacter={character}
  gameTemplateId={templateId}
  onGameEnd={(result) => console.log('Game ended', result)}
/>
```

### 기존 기능 보존
- 프롬프트 제작기 (Maker 모드)
- 게임 실행 엔진 (Game 모드)
- 캐릭터 변수 시스템
- 템플릿 컴파일
- AI 응답 생성

## 에러 처리

### 모듈 초기화 실패
```javascript
try {
  await module.initialize()
} catch (error) {
  console.error('Module initialization failed:', error)
  // 폴백: 모듈 없이 계속 진행
  return false
}
```

### AI 응답 생성 실패
```javascript
// 재시도 로직 (최대 3회)
// 실패 시 폴백 응답 생성
const fallbackResponses = [
  '예상치 못한 상황이 발생했지만, 모험은 계속됩니다.',
  // ...
]
```

### 렌더링 오류
```javascript
try {
  renderer.render(gameState)
} catch (error) {
  console.error('Rendering error:', error)
  // 계속 진행 (다음 프레임에서 복구 시도)
}
```

## 성능 최적화

### 렌더링 최적화
- requestAnimationFrame 사용
- 변경된 부분만 업데이트
- 캔버스 더블 버퍼링

### 메모리 관리
- 엔티티 풀링
- 효과 수 제한 (maxEffects)
- 입력 큐 크기 제한

### 모바일 최적화
- 터치 이벤트 최적화
- 성능 티어별 설정 조정
- 저사양 디바이스 폴백

## 확장 가능성

### 새 모듈 추가
1. 모듈 클래스 생성
2. initialize, update, cleanup 메서드 구현
3. UnifiedGameSystem에서 임포트 및 초기화
4. 이벤트 버스로 통신

### 새 렌더러 추가
```javascript
// 예: AudioRenderer
class AudioRenderer {
  async initialize() { }
  render(gameState) { }
  cleanup() { }
}
```

## 테스트

### 단위 테스트
각 모듈은 독립적으로 테스트 가능:
```javascript
test('GameEngine starts correctly', async () => {
  const engine = new GameEngine()
  await engine.initialize()
  const result = engine.start()
  expect(result).toBe(true)
  expect(engine.isGameRunning()).toBe(true)
})
```

### 통합 테스트
전체 시스템 테스트:
```javascript
test('UnifiedGameSystem initializes all modules', async () => {
  const system = render(<UnifiedGameSystem />)
  // 모든 모듈이 초기화되었는지 확인
})
```

## 마이그레이션 가이드

기존 코드는 그대로 동작합니다. 새로운 기능을 사용하려면:

### 이벤트 리스닝
```javascript
useEffect(() => {
  const handleNodeComplete = (data) => {
    console.log('Node completed:', data)
  }
  
  eventBus.current.on('node:complete', handleNodeComplete)
  
  return () => {
    eventBus.current.off('node:complete', handleNodeComplete)
  }
}, [])
```

### 직접 모듈 접근 (고급)
```javascript
// ref를 통해 모듈에 직접 접근 가능 (권장하지 않음)
if (gameEngineRef.current) {
  const state = gameEngineRef.current.getState()
}
```
