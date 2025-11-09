# Game Adapters

Purpose: allow users to plug any engine (2D/3D/턴제/로그라이크 등) via a small interface, authored in the code editor.

Mount points in this repo:
- `components/game/MainGameUI.jsx` and `components/game/MainGameMobileUI.jsx`: place a container/slot for the game surface.
- `components/game/slots/DynamicSlot.jsx`: map a slot to a component (e.g., a canvas or overlay).
- `components/game/GameRealtimeRuntime.jsx`: delivers ticks and runtime updates.

Adapter interface (engine-agnostic):
- Required: `init(container, ctx)`, `start()`, `stop()`, `dispose()`
- Optional: `loadAssets(assets)`, `update(dt)`, `resize()`, `onInput(input)`, `onMessage(msg)`, `getSnapshot()`
- `ctx` recommended fields: `{ sessionId, gameId, character, network, emit }`

Factory helpers:
- `lib/game/adapters/types.js` → `createGameAdapter(impl)`
- Example: `lib/game/adapters/exampleAdapter.js` (HTML5 canvas loop)

Recipe (Phaser or Three.js):
1) In the editor, create `src/game/index.js` and export a factory: `export default (opts) => ({ init, start, stop, dispose, update })`
2) On `init(container, ctx)`, mount engine (Phaser.Game or Three renderer) to `container`.
3) Wire runtime tick: call your `update(dt)` from `GameRealtimeRuntime` or your own RAF.
4) Handle `resize()` and `onInput()` for basics.
5) Use `ctx.network` to send/receive realtime messages.

Slot integration:
- Add a slot of type `game-canvas` and render your canvas/renderer there.
- Overlays (HUD/채팅)는 별도 슬롯에 `game-chat` 타입 연결.

