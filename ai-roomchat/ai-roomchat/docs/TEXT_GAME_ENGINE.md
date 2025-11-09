# Text Game Engine

Engine
- `lib/game/text/TextSceneEngine.js` — scene graph with `text`, `choices`, `effects` and `{{var}}` interpolation.

Minimal script
```json
{
  "start": "intro",
  "nodes": {
    "intro": { "text": "Hello {{name}}", "choices": [{ "label": "Go", "to": "room" }] },
    "room": { "text": "A dark room.", "choices": [] }
  }
}
```

Usage
```js
import { createTextEngine } from "../../lib/game/text/TextSceneEngine.js";
const engine = createTextEngine(script, { name: 'Hero' });
engine.subscribe((cur) => render(cur));
render(engine.current());
// choose by id/label/to
engine.choose('Go');
```

Tips
- Use `effects: [{ set: ["flag", true] }]` to set variables.
- Use conditions on choices: `{ when: "flag" }`.

