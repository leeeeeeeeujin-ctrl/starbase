# Genre Recipes (Quickstart)

2D Platformer/Action (Phaser)
- Physics: Arcade or Planck.js
- Tilemap: Tiled JSON → load in `loadAssets`
- Net: input capture → `network.send('input', ...)`; server broadcasts `state`

3D Adventure/Fighter (Three.js)
- Physics: cannon-es or rapier
- Camera: orbit or chase; resize on container rect
- Net: snapshot interpolation; limit payload sizes

Roguelike (rot.js)
- Map gen + FOV; single canvas in `game-canvas` slot
- Turn loop: local; optional co‑op via queued `cmd`

Turn‑based (FSM)
- Simple state machine; actions validated server‑side
- Broadcast `state` after each turn; clients render deterministically

Chat‑Driven (with AI)
- Use `InGameChatProvider` channels: `ai` for narration/AI actions, `party` for players
- Game adapter consumes AI channel events to progress scenes

