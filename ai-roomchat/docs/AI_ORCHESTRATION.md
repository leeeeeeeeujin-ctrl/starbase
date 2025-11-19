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

---

## 2. Text-battle nodes & ai-battle-judge (planned wiring)

텍스트 배틀 엔진 쪽에서는 프롬프트 그래프 노드를 “아레나/상황”처럼 쓰고,  
각 노드의 `config.battle`에 라우트/조건을 적어두는 구조를 사용한다 (see `docs/WORKSPACE_EDITOR_RUNTIME.md` 10.8).

이 레이어와 오케스트레이션/백엔드를 연결하는 기본 경로는:

- 프론트/런타임:
  - `transformPrompt(ctx)`에서 `config.battle` + `ctx.variables`를 사용해 **이번 턴용 프롬프트 문자열**을 만든다.
  - 이 프롬프트를 그대로 `/api/ai-battle-judge`의 통합 모드에 넘긴다:
    ```http
    POST /api/ai-battle-judge
    {
      "prompt": "<transformPrompt가 만든 프롬프트>",
      "gameState": {
        "nodeId": ctx.node.id,
        "turn": ctx.turn,
        "variables": ctx.variables
      },
      "character": {
        "id": "...",
        "name": "...",
        "...": "..."
      }
    }
    ```
- 백엔드 (`ai-roomchat/pages/api/ai-battle-judge.js`):
  - `processUnifiedGamePrompt({ prompt, gameState, character })`에서:
    - `callAIJudge(prompt)`로 AI를 호출.
    - `parseAIResponse(aiResponse)`를 재사용해 구조화된 결과를 만든 뒤, 다음과 같이 반환한다:
      - `narrative` – 사람이 바로 볼 수 있는 서술.
      - `response` – 원본 응답 텍스트.
      - `result` – `success | partial | failure | critical | continue`.
      - `battleEnd` – 이번 턴으로 배틀이 끝났는지 여부.
      - `winner` – 승자 id 또는 null.
      - `effects` – 시각 효과/상태 변경 설명(있다면).
      - `gameState` – 호출 시 받은 gameState를 그대로 에코.

이 값을 텍스트 배틀 엔진에서는 다음과 같이 사용할 수 있다 (문서 수준 설계):

- 훅/런타임:
  - `/game/hooks/automation.js` 또는 별도 오케스트레이션 코드에서:
    - `result`/`battleEnd`/`winner` 값을 `ctx.variables` (예: `variables.battleResult`, `variables.battleWinner`)에 기록한다.
  - `onUserAction(ctx, input)` 또는 `selectNext(ctx, neighbors)`에서:
    - 기록된 결과를 읽어:
      - `hero_win`, `rival_win`, `tie`, `continue` 같은 **outcome 토큰**을 결정하고,
      - 노드의 `config.battle.routes` (`on_hero_win`, `on_rival_win`, `on_tie`, …)에 맞춰 다음 노드 id를 선택한다.

요약:

- 이 파일(`AI_ORCHESTRATION.md`)이 설명하는 오케스트레이터/AI 어댑터 층은  
  “프롬프트를 실제 LLM에게 보내고 텍스트/JSON을 돌려받는 층”.
- 텍스트 배틀 엔진은:
  - `/game/hooks/automation.js`의 `transformPrompt`/`onUserAction`/`selectNext`,
  - `/graph/prompt-graph.json`의 `config.battle.routes`
  를 통해 “어떤 outcome 토큰을 어떤 그래프 이동으로 해석할지”를 정의하는 층.
- `/api/ai-battle-judge`의 통합 모드는 둘 사이에서:
  - 프롬프트 → LLM 응답 → `result`/`battleEnd`/`winner`로 변환하는 **중간 심판/파서 역할**을 맡는다.
