# Plugin Host (Editor → Main Game)

Goal: user code written in the editor can power the running game via a thin adapter.

Components
- Host: `components/game/host/GamePluginHost.jsx`
- Slot wrapper: `components/game/slots/GameCanvasSlot.jsx`

Adapter contract
- Use `createGameAdapter` from `lib/game/adapters/types.js`
- Required methods: `init(container, ctx)`, `start()`, `stop()`, `dispose()`
- Optional: `update(dt)`, `resize()`, `onInput(input)`, `onMessage(msg)`, `getSnapshot()`

Context (ctx)
- `{ sessionId, gameId, character, network, emit }`
- `character` comes from `CharacterProvider` (see `docs/CHARACTER_DATA.md`)
- `network` is a `createNetworkAdapter` impl (see `docs/NETWORK_ADAPTERS.md`)

Usage
```jsx
import GameSessionShell from "../components/game/GameSessionShell.jsx";
import GameCanvasSlot from "../components/game/slots/GameCanvasSlot.jsx";

export default function PlayPage() {
  const sessionId = "s1"; const gameId = "g1";
  const user = { id: "u1", name: "Player" };
  const character = { name: "Hero", score: 0 };
  const network = null; // or a network adapter
  return (
    <GameSessionShell sessionId={sessionId} gameId={gameId} user={user} character={character} network={network}>
      <div style={{ position: 'relative', width: '100%', height: 480 }}>
        <GameCanvasSlot slotConfig={{ /* adapterFactory */ }} sessionId={sessionId} gameId={gameId} character={character} network={network} />
      </div>
    </GameSessionShell>
  );
}
```

Notes
- If no `adapterFactory` is supplied, an example canvas adapter is used for smoke testing.
- Map `GameCanvasSlot` to a `DynamicSlot` type (e.g., `type: 'game-canvas'`) to place it via your runtime layout.

