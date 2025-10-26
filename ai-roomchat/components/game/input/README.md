# Input Handler Module

통합 게임 시스템의 입력 처리를 담당하는 모듈입니다.

## 📁 구조

```
components/game/input/
├── InputManager.js       # 통합 입력 관리 및 이벤트 라우팅
├── KeyboardHandler.js    # 키보드 이벤트 처리
├── TouchHandler.js       # 터치/포인터 이벤트 처리 (모바일 최적화)
├── GamepadHandler.js     # 게임패드 지원
└── index.js             # 모듈 export
```

## 🎯 주요 기능

### InputManager

- **통합 입력 관리**: 키보드, 터치, 게임패드 입력을 단일 인터페이스로 관리
- **이벤트 라우팅**: 입력 이벤트를 적절한 리스너로 전달
- **입력 녹화/재생**: 게임 플레이 녹화 및 재생 지원
- **동적 활성화/비활성화**: 실행 중 입력 타입 활성화 제어

### KeyboardHandler

- **키 입력 중복 방지**: Debounce/throttle로 중복 입력 방지
- **키보드 단축키**: Ctrl/Alt/Shift + 키 조합 지원
- **접근성**: 키보드 네비게이션 지원
- **크로스 브라우저**: IE11+ 호환성

### TouchHandler

- **제스처 인식**: Tap, Swipe, Pinch, Long-press 감지
- **Passive Listeners**: 스크롤 성능 최적화
- **통합 이벤트**: Touch/Pointer/Mouse 이벤트 통합 처리
- **모바일 최적화**: 터치 반응성 최적화

### GamepadHandler

- **다중 게임패드**: 여러 게임패드 동시 지원
- **표준 매핑**: Xbox/PlayStation 컨트롤러 표준 버튼 매핑
- **Deadzone**: 아날로그 스틱 데드존 처리
- **폴링 기반**: Gamepad API 폴링으로 입력 감지

## 🔧 사용 방법

### 기본 사용

```javascript
import { InputManager } from './components/game/input';

// InputManager 초기화
const inputManager = new InputManager({
  element: document.body,
  enableKeyboard: true,
  enableTouch: true,
  enableGamepad: false,
  onInput: event => {
    console.log('Input received:', event);
  },
});

await inputManager.initialize();

// 특정 입력 타입 리스너 등록
inputManager.on('keyboard', event => {
  console.log('Keyboard input:', event.key);
});

inputManager.on('touch', event => {
  console.log('Touch input:', event.x, event.y);
});

// 모든 입력 리스너
inputManager.on('*', event => {
  console.log('Any input:', event.type);
});

// 정리
inputManager.cleanup();
```

### 개별 핸들러 사용

```javascript
import { KeyboardHandler, TouchHandler, GamepadHandler } from './components/game/input';

// 키보드 핸들러
const keyboard = new KeyboardHandler({
  element: document,
  debounceDelay: 100,
  onKeyDown: event => {
    console.log('Key pressed:', event.key);
  },
});

await keyboard.initialize();

// 터치 핸들러
const touch = new TouchHandler({
  element: document.body,
  enableGestures: true,
  onSwipe: data => {
    console.log('Swipe detected:', data.direction);
  },
});

await touch.initialize();

// 게임패드 핸들러
const gamepad = new GamepadHandler({
  onButtonPress: data => {
    console.log('Button pressed:', data.buttonName);
  },
});

await gamepad.initialize();
```

## 🌐 호환성

### 지원 브라우저

- **IE 11+**: 제한적 지원 (Pointer Events 사용)
- **Chrome 70+**: 완전 지원
- **Firefox 65+**: 완전 지원
- **Safari 12+**: 완전 지원
- **Edge 12+**: 완전 지원

### 모바일

- **iOS 12+**: 터치 및 제스처 완전 지원
- **Android 7.0+**: 터치 및 제스처 완전 지원

### 기능 지원

- ✅ Touch Events
- ✅ Pointer Events (IE11+)
- ✅ Mouse Events (폴백)
- ✅ Keyboard Events
- ✅ Gamepad API (Chrome 21+, Firefox 29+)
- ✅ Passive Event Listeners
- ✅ Custom Events

## 🔒 메모리 누수 방지

모든 핸들러는 `cleanup()` 메서드를 제공하여 메모리 누수를 방지합니다:

```javascript
// 이벤트 리스너 자동 제거
handler.cleanup();

// React 컴포넌트에서 사용
useEffect(() => {
  const inputManager = new InputManager({
    /* ... */
  });
  inputManager.initialize();

  return () => {
    inputManager.cleanup(); // 컴포넌트 언마운트 시 정리
  };
}, []);
```

### 정리되는 리소스

- Event listeners (addEventListener로 등록된 모든 리스너)
- Timers (debounce, throttle, long-press)
- Polling intervals (gamepad)
- State maps and sets

## 🎮 게임 통합

UnifiedGameSystem에서 사용 예:

```javascript
// UnifiedGameSystem.js
import { InputManager } from './input/InputManager';

const inputManager = useRef(null);

useEffect(() => {
  inputManager.current = new InputManager({
    element: document,
    enableKeyboard: true,
    enableTouch: isMobile,
    enableGamepad: false,
    onInput: event => {
      if (systemMode === 'game') {
        handleGameInput(event);
      }
    },
  });

  inputManager.current.initialize();

  return () => {
    inputManager.current?.cleanup();
  };
}, []);

const handleGameInput = inputEvent => {
  if (inputEvent.type === 'keyboard') {
    // 키보드 입력 처리
    if (inputEvent.key === '1') {
      handleUserAction('공격');
    }
  } else if (inputEvent.type === 'touch') {
    // 터치 제스처 처리
    if (inputEvent.gesture === 'swipe-left') {
      handleUserAction('공격');
    }
  }
};
```

## 📊 입력 녹화/재생

```javascript
// 입력 녹화 시작
inputManager.startRecording();

// 게임 플레이...

// 녹화 중지 및 데이터 가져오기
const recording = inputManager.stopRecording();

// 재생 (2배속)
await inputManager.replay(recording, 2.0);
```

## 🎯 제스처 감지

```javascript
const touch = new TouchHandler({
  element: canvas,
  enableGestures: true,
  tapThreshold: 10, // 탭으로 인식할 최대 이동 거리 (픽셀)
  swipeThreshold: 100, // 스와이프로 인식할 최소 이동 거리 (픽셀)
  longPressDuration: 500, // 롱프레스 인식 시간 (밀리초)

  onTap: data => {
    console.log('Tap at:', data.x, data.y);
  },

  onSwipe: data => {
    console.log('Swipe:', data.direction, data.velocity);
  },

  onLongPress: data => {
    console.log('Long press at:', data.x, data.y);
  },

  onPinch: data => {
    console.log('Pinch scale:', data.scale);
  },
});
```

## 🎮 게임패드 매핑

표준 Xbox/PlayStation 컨트롤러 버튼 매핑:

| Index | 버튼 이름 | Xbox        | PlayStation  |
| ----- | --------- | ----------- | ------------ |
| 0     | A         | A           | Cross (×)    |
| 1     | B         | B           | Circle (○)   |
| 2     | X         | X           | Square (□)   |
| 3     | Y         | Y           | Triangle (△) |
| 4     | LB        | LB          | L1           |
| 5     | RB        | RB          | R1           |
| 6     | LT        | LT          | L2           |
| 7     | RT        | RT          | R2           |
| 8     | SELECT    | View        | Share        |
| 9     | START     | Menu        | Options      |
| 10    | LS        | Left Stick  | L3           |
| 11    | RS        | Right Stick | R3           |
| 12    | UP        | D-Pad Up    | D-Pad Up     |
| 13    | DOWN      | D-Pad Down  | D-Pad Down   |
| 14    | LEFT      | D-Pad Left  | D-Pad Left   |
| 15    | RIGHT     | D-Pad Right | D-Pad Right  |
| 16    | HOME      | Xbox Button | PS Button    |

## 🧪 테스트

테스트 파일 위치: `__tests__/components/game/input-handlers.test.js`

```bash
npm test -- __tests__/components/game/input-handlers.test.js
```

## 📝 API 문서

각 모듈의 상세한 API는 JSDoc 주석으로 문서화되어 있습니다.

### InputManager API

- `initialize()`: 입력 관리자 초기화
- `on(type, callback)`: 이벤트 리스너 등록
- `off(type, callback)`: 이벤트 리스너 제거
- `startRecording()`: 입력 녹화 시작
- `stopRecording()`: 입력 녹화 중지
- `replay(recording, speed)`: 입력 재생
- `getState()`: 현재 입력 상태 조회
- `setInputEnabled(type, enabled)`: 입력 타입 활성화/비활성화
- `cleanup()`: 리소스 정리

### KeyboardHandler API

- `initialize()`: 초기화
- `isKeyPressed(key)`: 키 눌림 상태 확인
- `getPressedKeys()`: 현재 눌린 키 목록
- `cleanup()`: 리소스 정리

### TouchHandler API

- `initialize()`: 초기화
- `cleanup()`: 리소스 정리

### GamepadHandler API

- `initialize()`: 초기화
- `getGamepadState(index)`: 게임패드 상태 조회
- `getAllGamepads()`: 모든 게임패드 조회
- `isButtonPressed(gamepadIndex, buttonIndex)`: 버튼 눌림 확인
- `getAxisValue(gamepadIndex, axisIndex)`: 축 값 조회
- `cleanup()`: 리소스 정리

## 🔄 통합 방법

### MobileOptimizationManager와 통합

- TouchHandler는 MobileOptimizationManager의 터치 최적화 설정을 사용
- 모바일 디바이스 감지 시 자동으로 터치 핸들러 활성화
- Passive listener 지원으로 스크롤 성능 최적화

### CompatibilityManager와 통합

- 브라우저 호환성 정보 기반 기능 활성화
- IE11에서 Pointer Events 폴백
- Feature detection으로 안전한 기능 사용

## 🐛 알려진 제한사항

1. **IE11 Gamepad API**: IE11에서 Gamepad API는 제한적으로 지원됩니다
2. **Safari Pointer Events**: Safari 12 이하에서 Pointer Events 미지원
3. **iOS Touch Delay**: iOS Safari에서 300ms 터치 지연 (touchAction으로 완화)

## 📄 라이선스

이 프로젝트의 라이선스를 따릅니다.
