# Game Renderers Module

게임 렌더링 시스템을 위한 모듈화된 Canvas 렌더러 컴포넌트입니다.

## 📦 모듈 구성

### GameRenderer

메인 게임 캔버스 렌더링을 담당합니다.

**주요 기능:**

- Canvas 2D / WebGL 렌더링 (자동 폴백)
- 배경 및 엔티티 렌더링
- 이미지 로딩 및 캐싱
- requestAnimationFrame 기반 렌더링 루프
- 디바이스 픽셀 비율 대응

### UIRenderer

UI 오버레이 렌더링을 담당합니다.

**주요 기능:**

- 플레이어 스탯 바 (HP, MP, EXP)
- 인벤토리 UI
- 미니맵
- 메시지 박스
- 반응형 레이아웃

### EffectsRenderer

파티클 및 화면 효과를 렌더링합니다.

**주요 기능:**

- 파티클 시스템 (폭발, 스트림)
- 화면 효과 (흔들림, 페이드, 플래시)
- 파티클 풀링 (메모리 최적화)
- 물리 기반 애니메이션

## 🚀 빠른 시작

### 설치 및 Import

```javascript
import { GameRenderer, UIRenderer, EffectsRenderer } from '@/components/game/renderers';
```

### 기본 사용법

#### 1. GameRenderer 사용

```javascript
// Canvas 요소 생성
const gameCanvas = document.getElementById('game-canvas');

// 렌더러 초기화
const gameRenderer = new GameRenderer({
  canvas: gameCanvas,
  width: 800,
  height: 600,
  enableWebGL: false, // true로 설정 시 WebGL 사용 시도
  autoResize: true,
});

// 배경 렌더링
gameRenderer.renderBackground(null, '#1a1a2e');

// 텍스트 렌더링
gameRenderer.renderText('Hello World', 100, 100, {
  font: 'bold 24px sans-serif',
  color: '#ffffff',
});

// 엔티티 렌더링
const entity = {
  x: 200,
  y: 200,
  width: 50,
  height: 50,
  imageUrl: '/path/to/image.png',
};
gameRenderer.renderEntity(entity);

// 렌더링 루프 시작
gameRenderer.startRenderLoop((timestamp, renderer) => {
  renderer.clear('#1a1a2e');
  // 프레임마다 렌더링할 내용
});

// 정리
gameRenderer.cleanup();
```

#### 2. UIRenderer 사용

```javascript
const uiCanvas = document.getElementById('ui-canvas');

const uiRenderer = new UIRenderer({
  canvas: uiCanvas,
  width: 800,
  height: 600,
});

// UI 데이터 정의
const uiData = {
  stats: {
    name: 'Player',
    hp: 80,
    maxHp: 100,
    mp: 30,
    maxMp: 50,
    level: 5,
    exp: 150,
    maxExp: 200,
  },
  inventory: [
    { id: '1', name: 'Sword', iconUrl: '/sword.png', count: 1 },
    { id: '2', name: 'Potion', iconUrl: '/potion.png', count: 5 },
  ],
  mapData: {},
  playerPos: { x: 100, y: 100 },
  message: 'Welcome!',
  messageOptions: { type: 'info' },
};

// UI 렌더링
uiRenderer.render(uiData);

// 개별 요소 렌더링
uiRenderer.renderStatsBar(uiData.stats);
uiRenderer.renderInventory(uiData.inventory, 12);
uiRenderer.renderMiniMap(uiData.mapData, uiData.playerPos);
uiRenderer.renderMessage('Level Up!', { type: 'success' });

// 정리
uiRenderer.cleanup();
```

#### 3. EffectsRenderer 사용

```javascript
const effectsCanvas = document.getElementById('effects-canvas');

const effectsRenderer = new EffectsRenderer({
  canvas: effectsCanvas,
  width: 800,
  height: 600,
  maxParticles: 500,
});

// 애니메이션 시작 (필수)
effectsRenderer.startAnimation();

// 폭발 효과
effectsRenderer.emitExplosion(400, 300, {
  count: 30,
  color: '#ff6b35',
  speed: 8,
  life: 1,
});

// 스트림 효과
effectsRenderer.emitStream(100, 100, Math.PI / 4, {
  color: '#4ade80',
  speed: 3,
  spread: 0.5,
});

// 화면 효과
effectsRenderer.shakeScreen(10, 0.5);
effectsRenderer.fadeScreen(0.5, 1);
effectsRenderer.flashScreen('#ffffff', 0.3);

// 모든 효과 제거
effectsRenderer.clearAllEffects();

// 정리
effectsRenderer.cleanup();
```

## 🎨 고급 사용법

### 캔버스 레이어링

여러 렌더러를 레이어로 쌓아 사용하세요:

```html
<div style="position: relative; width: 800px; height: 600px;">
  <!-- 게임 레이어 (배경) -->
  <canvas id="game-canvas" style="position: absolute; top: 0; left: 0;"></canvas>

  <!-- UI 레이어 (중간) -->
  <canvas
    id="ui-canvas"
    style="position: absolute; top: 0; left: 0; pointer-events: none;"
  ></canvas>

  <!-- 이펙트 레이어 (전경) -->
  <canvas
    id="effects-canvas"
    style="position: absolute; top: 0; left: 0; pointer-events: none;"
  ></canvas>
</div>
```

### React 컴포넌트에서 사용

```javascript
import React, { useRef, useEffect } from 'react';
import { GameRenderer, UIRenderer, EffectsRenderer } from '@/components/game/renderers';

function GameComponent() {
  const gameCanvasRef = useRef(null);
  const uiCanvasRef = useRef(null);
  const effectsCanvasRef = useRef(null);

  const gameRenderer = useRef(null);
  const uiRenderer = useRef(null);
  const effectsRenderer = useRef(null);

  useEffect(() => {
    // 렌더러 초기화
    if (gameCanvasRef.current && !gameRenderer.current) {
      gameRenderer.current = new GameRenderer({
        canvas: gameCanvasRef.current,
        width: 800,
        height: 600,
      });
    }

    if (uiCanvasRef.current && !uiRenderer.current) {
      uiRenderer.current = new UIRenderer({
        canvas: uiCanvasRef.current,
        width: 800,
        height: 600,
      });
    }

    if (effectsCanvasRef.current && !effectsRenderer.current) {
      effectsRenderer.current = new EffectsRenderer({
        canvas: effectsCanvasRef.current,
        width: 800,
        height: 600,
      });
      effectsRenderer.current.startAnimation();
    }

    // 정리
    return () => {
      gameRenderer.current?.cleanup();
      uiRenderer.current?.cleanup();
      effectsRenderer.current?.cleanup();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '800px', height: '600px' }}>
      <canvas ref={gameCanvasRef} />
      <canvas ref={uiCanvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
      <canvas ref={effectsCanvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
    </div>
  );
}
```

### 반응형 캔버스

```javascript
const gameRenderer = new GameRenderer({
  canvas: gameCanvas,
  width: window.innerWidth,
  height: window.innerHeight,
  autoResize: true, // 자동 리사이즈 활성화
});

// 수동 리사이즈
window.addEventListener('resize', () => {
  gameRenderer.resize(window.innerWidth, window.innerHeight);
});
```

## 🔧 API 레퍼런스

### GameRenderer

#### 생성자

```javascript
new GameRenderer(config);
```

**config 파라미터:**

- `canvas` (HTMLCanvasElement, 필수) - 렌더링할 캔버스
- `width` (number, 기본값: 800) - 캔버스 너비
- `height` (number, 기본값: 600) - 캔버스 높이
- `enableWebGL` (boolean, 기본값: false) - WebGL 사용 여부
- `autoResize` (boolean, 기본값: true) - 자동 리사이즈
- `pixelRatio` (number, 기본값: devicePixelRatio) - 픽셀 비율

#### 주요 메서드

- `clear(color)` - 캔버스 클리어
- `renderBackground(imageUrl, fallbackColor)` - 배경 렌더링
- `renderEntity(entity)` - 엔티티 렌더링
- `renderText(text, x, y, options)` - 텍스트 렌더링
- `loadImage(url)` - 이미지 로드 (캐싱)
- `startRenderLoop(callback)` - 렌더링 루프 시작
- `stopRenderLoop()` - 렌더링 루프 정지
- `resize(width, height)` - 캔버스 리사이즈
- `cleanup()` - 리소스 정리

### UIRenderer

#### 생성자

```javascript
new UIRenderer(config);
```

**config 파라미터:**

- `canvas` (HTMLCanvasElement, 필수)
- `width` (number, 기본값: 800)
- `height` (number, 기본값: 600)
- `pixelRatio` (number, 기본값: devicePixelRatio)

#### 주요 메서드

- `render(uiData)` - 전체 UI 렌더링
- `renderStatsBar(stats)` - 스탯 바 렌더링
- `renderInventory(items, maxSlots)` - 인벤토리 렌더링
- `renderMiniMap(mapData, playerPos)` - 미니맵 렌더링
- `renderMessage(message, options)` - 메시지 박스 렌더링
- `clear()` - 캔버스 클리어
- `resize(width, height)` - 캔버스 리사이즈
- `cleanup()` - 리소스 정리

### EffectsRenderer

#### 생성자

```javascript
new EffectsRenderer(config);
```

**config 파라미터:**

- `canvas` (HTMLCanvasElement, 필수)
- `width` (number, 기본값: 800)
- `height` (number, 기본값: 600)
- `pixelRatio` (number, 기본값: devicePixelRatio)
- `maxParticles` (number, 기본값: 1000)

#### 주요 메서드

- `startAnimation()` - 애니메이션 시작 (필수)
- `stopAnimation()` - 애니메이션 정지
- `emitExplosion(x, y, options)` - 폭발 효과
- `emitStream(x, y, angle, options)` - 스트림 효과
- `shakeScreen(intensity, duration)` - 화면 흔들림
- `fadeScreen(targetAlpha, duration)` - 화면 페이드
- `flashScreen(color, duration)` - 화면 플래시
- `clearAllEffects()` - 모든 효과 제거
- `resize(width, height)` - 캔버스 리사이즈
- `cleanup()` - 리소스 정리

## 🌐 브라우저 호환성

### 지원 브라우저

- ✅ Internet Explorer 11+
- ✅ Safari 12+
- ✅ Chrome 70+
- ✅ Firefox 65+
- ✅ Edge 14+
- ✅ iOS Safari 12+
- ✅ Android Chrome 70+

### 호환성 기능

- Canvas 2D API 사용 (IE11 완벽 지원)
- WebGL 폴백 지원
- requestAnimationFrame 폴리필
- 벤더 프리픽스 자동 처리
- 모바일 터치 이벤트 대응

## 📱 모바일 최적화

### 고해상도 디스플레이

자동으로 `devicePixelRatio`를 감지하여 고해상도 디스플레이에 최적화된 렌더링을 제공합니다.

### 반응형 레이아웃

UIRenderer는 600px 이하의 작은 화면에서 자동으로 레이아웃을 조정합니다.

### 메모리 최적화

- 파티클 풀링으로 객체 생성/소멸 최소화
- 이미지 캐싱으로 중복 로드 방지
- cleanup 함수로 메모리 누수 방지

## 🧪 테스트

### 테스트 실행

```bash
npm test -- __tests__/components/game/renderers
```

### 테스트 커버리지

- GameRenderer: 13개 테스트
- UIRenderer: 21개 테스트
- EffectsRenderer: 18개 테스트
- **총 52개 테스트 통과**

## 🐛 문제 해결

### Canvas가 초기화되지 않을 때

```javascript
// canvas.getContext('2d')가 null을 반환하는 경우
// 캔버스가 DOM에 추가되었는지 확인
if (!canvas.parentNode) {
  document.body.appendChild(canvas);
}

// 또는 React에서 ref가 준비될 때까지 대기
useEffect(() => {
  if (canvasRef.current) {
    const renderer = new GameRenderer({ canvas: canvasRef.current });
  }
}, [canvasRef.current]);
```

### 성능 이슈

```javascript
// 파티클 수 줄이기
const effectsRenderer = new EffectsRenderer({
  canvas: effectsCanvas,
  maxParticles: 100, // 기본값 1000에서 감소
});

// 렌더링 빈도 줄이기
let lastRender = 0;
gameRenderer.startRenderLoop(timestamp => {
  if (timestamp - lastRender < 16.67) return; // ~60fps
  lastRender = timestamp;
  // 렌더링 로직
});
```

### 메모리 누수

```javascript
// 컴포넌트 언마운트 시 반드시 cleanup 호출
useEffect(() => {
  const renderer = new GameRenderer({ canvas: canvasRef.current });

  return () => {
    renderer.cleanup(); // 필수!
  };
}, []);
```

## 📄 라이선스

이 모듈은 MIT 라이선스 하에 배포됩니다.

## 🤝 기여

버그 리포트나 기능 제안은 GitHub Issues를 통해 제출해주세요.

---

**Version:** 1.0.0  
**Last Updated:** 2025-10-22
