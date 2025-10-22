# UnifiedGameSystem 모듈화 조율 계획

## 📋 전체 구조

```
components/game/
├── UnifiedGameSystem.js (메인 오케스트레이션)
├── renderers/
│   ├── GameRenderer.js
│   ├── UIRenderer.js
│   └── EffectsRenderer.js
├── input/
│   ├── InputManager.js
│   ├── KeyboardHandler.js
│   ├── TouchHandler.js
│   └── GamepadHandler.js
└── logic/
    ├── GameEngine.js
    ├── PhysicsEngine.js
    ├── EntityManager.js
    └── ScoreManager.js
```

## 🚀 Phase별 진행 계획

### Phase 1: 렌더링 + 입력 핸들러 (동시 진행)
**기간**: 현재 ~ 완료시까지
**담당**: 
- `copilot/vscode1761174898565` - 렌더링 로직
- `copilot/separate-input-handler-module` - 입력 핸들러

**작업 내용**:
- 렌더링: `GameRenderer.js`, `UIRenderer.js`, `EffectsRenderer.js` 생성
- 입력: `InputManager.js`, `KeyboardHandler.js`, `TouchHandler.js`, `GamepadHandler.js` 생성
- 두 모듈은 독립적이므로 충돌 없음

**공통 인터페이스**:
```javascript
// 렌더링 모듈 export
export class GameRenderer {
  constructor(canvas, context) {}
  render(gameState) {}
  clear() {}
}

// 입력 모듈 export
export class InputManager {
  constructor(element) {}
  getInputState() {}
  addEventListener(type, handler) {}
}
```

### Phase 2: 게임 로직 분리
**기간**: Phase 1 완료 후
**담당**: `copilot/split-game-logic-module`

**작업 내용**:
- `GameEngine.js`: 게임 루프, 상태 관리
- `PhysicsEngine.js`: 충돌 감지, 물리 시뮬레이션
- `EntityManager.js`: 엔티티 생성/삭제
- `ScoreManager.js`: 점수 계산

**의존성**: Phase 1의 입력 상태를 받아 로직 처리

### Phase 3: 품질 검수 + 통합
**기간**: Phase 2 완료 후
**담당**: 
- `copilot/refactor-game-system-quality` - 테스트 및 검수
- `copilot/refactor-unified-game-system` - 메인 통합

**작업 내용**:
- 품질 검수: 테스트 코드 작성, 성능 측정, 리포트 생성
- 통합: `UnifiedGameSystem.js`를 오케스트레이션 레이어로 리팩토링

## 🔧 호환성 요구사항 (모든 모듈 공통)

### 필수 지원 브라우저
- IE 11+
- Safari 12+
- Chrome 70+
- Firefox 65+
- iOS 12+
- Android 7.0+

### 코드 스타일
- **NO** optional chaining (`?.`) - Babel 트랜스파일 필요
- **NO** nullish coalescing (`??`) - Babel 트랜스파일 필요
- **USE** `var` 또는 `const/let` (Babel이 변환)
- **USE** 명시적 null 체크: `if (obj && obj.property)`
- **USE** requestAnimationFrame (폴리필 포함)
- **USE** addEventListener (IE11 지원)

### 성능 최적화
- 메모리 누수 방지 (cleanup 함수 필수)
- requestAnimationFrame 사용
- 디바운싱/쓰로틀링 적용
- 모바일 해상도 대응 (devicePixelRatio)

### JSDoc 주석 필수
```javascript
/**
 * 게임 렌더러
 * @param {HTMLCanvasElement} canvas - 캔버스 엘리먼트
 * @param {CanvasRenderingContext2D} context - 캔버스 컨텍스트
 */
```

## 📡 에이전트 간 커뮤니케이션

### 진행 상황 공유
각 에이전트는 PR 코멘트로 진행 상황을 공유해주세요:
- 완료한 파일 목록
- export하는 인터페이스
- 다른 모듈에 필요한 요구사항

### 충돌 방지
- 같은 파일을 수정하지 않기
- export 인터페이스는 위 계획대로 유지
- 의존성 변경시 다른 PR에 코멘트로 알림

## ✅ 완료 조건

### 각 모듈
- [ ] 모든 파일 생성 완료
- [ ] JSDoc 주석 작성
- [ ] cleanup 함수 구현
- [ ] 호환성 테스트 통과

### 통합
- [ ] UnifiedGameSystem.js 리팩토링
- [ ] 기존 기능 유지 확인
- [ ] 성능 저하 없음
- [ ] npm test 통과

## 🎯 현재 상태 (2025-10-23)

- ✅ Phase 1 시작: 렌더링 + 입력 핸들러 동시 진행 중
- ⏳ Phase 2 대기: 게임 로직
- ⏳ Phase 3 대기: 품질 검수 + 통합

---

**Manager**: GitHub Copilot Agent Coordinator
**Updated**: 2025-10-23
