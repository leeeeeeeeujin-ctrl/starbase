# Character Data

Provided to game code and UI as a simple context so users can reference current player/character in slots and adapters.

Context
- `lib/game/context/CharacterContext.jsx` → `CharacterProvider` and `useCharacter()`
- Fields: `image, name, description, ability1..4, ownerId, characterId, score, role, extras`

Usage
```jsx
import { CharacterProvider, useCharacter } from "../../lib/game/context/CharacterContext.jsx";

function HUD() {
  const c = useCharacter();
  return <div>{c.name} · {c.role} · 점수 {c.score}</div>;
}
```

Sample data
- See `ai-roomchat/docs/reference-data/` for JSON examples you can map in your loader.

Notes
- Keep PII out of character fields. Use `extras` for game‑specific payload.
- When syncing over network, send only what the server/room needs.

