# AI Orchestration (Realtime LLM‑Driven Gameplay)

Default mode: synchronized AI chat drives gameplay. Players have characters; prompts use character/session variables; responses can be time‑limited and targeted to specific audiences (slots/roles/players), with hidden content for others.

Building blocks
- AI adapter: `lib/game/ai/types.js` → `createAIAdapter({ invoke })`
- Orchestrator: `lib/game/ai/AIOrchestrator.js` → `runPrompt({ template, character, audience, timeoutMs })`
- Templating: `lib/game/ai/template.js` → `renderPrompt`, `buildAudience`, `matchesAudience`
- Chat: `components/game/chat/InGameChatProvider.jsx` + `InGameChatOverlay.jsx` (audience‑aware)
- Character: `lib/game/context/CharacterContext.jsx`

Audience tags
- `all`, `player:{userId}`, `role:{role}`, `character:{characterId}`, `slot:{slotId}`

Usage sketch
```js
import { createAIOrchestrator } from "../../lib/game/ai/AIOrchestrator.js";
import { buildAudience } from "../../lib/game/ai/template.js";

const ai = createAIOrchestrator({ aiAdapter, chat, network, sessionId, gameId });
const audience = buildAudience({ roles: ['healer'], players: ['u1'] });
await ai.runPrompt({ template: 'Heal {{character.name}}?', character, audience, timeoutMs: 10000 });
```

Visibility
- `InGameChatOverlay` filters messages: only viewers matching `meta.audience` see them.
- Provide `viewer={{ id, role, characterId, slotId }}` to the overlay.

Timers
- Pass `timeoutMs` to `runPrompt`. On timeout, an error is posted to the AI channel.

Networking
- Orchestrator optionally emits `network.send('event', { type:'ai:response', ...})` for cross‑client sync.

Security
- AI keys/API are not exposed in gameplay code. Implement an AI adapter that calls your server or a proxy route.
```js
const aiAdapter = createAIAdapter({
  async invoke({ prompt, sessionId, gameId }) {
    const res = await fetch('/api/ai/proxy', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, sessionId, gameId }) });
    const json = await res.json();
    return { text: json.text };
  }
});
```

Tips
- Use `docs/AI_GAME_PROMPTS.md` to guide AI code chat when scaffolding user game modules.
- Combine with `TurnManager`/`TextSceneEngine` for judge/battle flows.

