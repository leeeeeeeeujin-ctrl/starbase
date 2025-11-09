# State & Turns (Turn-Based)

Helpers
- `lib/game/state/TurnManager.js` → `createTurnManager(players)` and `createFSM(initial, transitions)`

Patterns
- Maintain authoritative order server‑side; clients mirror via `snapshot/apply`.
- Emit `input` as intent; server validates and broadcasts `state`.

Example
```js
import { createTurnManager, createFSM } from "../../lib/game/state/TurnManager.js";
const tm = createTurnManager(["p1","p2"]);
tm.on('turn', (p) => console.log('Now', p));
tm.next();

const fsm = createFSM('idle', {
  idle: { start: () => 'playing' },
  playing: { pause: () => 'paused', end: () => 'ended' },
});
```

