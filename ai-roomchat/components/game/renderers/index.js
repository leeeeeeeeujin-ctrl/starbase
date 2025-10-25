/**
 * 🎨 Game Renderers Module
 *
 * @description
 * 게임 렌더링 시스템을 위한 통합 모듈
 * - GameRenderer: 메인 게임 캔버스 렌더링
 * - UIRenderer: UI 오버레이 렌더링
 * - EffectsRenderer: 파티클 및 애니메이션 효과
 *
 * @example
 * ```javascript
 * import { GameRenderer, UIRenderer, EffectsRenderer } from './renderers'
 *
 * const gameRenderer = new GameRenderer({ canvas: gameCanvas })
 * const uiRenderer = new UIRenderer({ canvas: uiCanvas })
 * const effectsRenderer = new EffectsRenderer({ canvas: effectsCanvas })
 * ```
 *
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 * @version 1.0.0
 */

export { GameRenderer } from './GameRenderer.js';
export { UIRenderer } from './UIRenderer.js';
export { EffectsRenderer } from './EffectsRenderer.js';
