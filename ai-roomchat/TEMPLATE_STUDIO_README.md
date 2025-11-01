Template Studio scaffolding

Files added:

- public/templates/template.schema.json
- public/templates/basic-game.json
- lib/templateStore.js
- lib/validator.js
- lib/runners/index.js
- lib/runners/mock.js
- lib/runners/cli.js
- lib/runners/proxy.js

How to use (suggested wiring):

1) Load a template in your editor component and validate:

   import basic from "../public/templates/basic-game.json";
   import { validateTemplate } from "../lib/validator";
   const { ok, errors } = validateTemplate(basic);

2) Save/load from localStorage:

   import { loadTemplate, saveTemplate } from "../lib/templateStore";
   const key = "template:current";
   const t = loadTemplate(key) || basic;
   saveTemplate(key, t);

3) Run with mock runner:

   import { createRunner } from "../lib/runners";
   const runner = createRunner("mock");
   const result = await runner.run(t, { branch: "left" });

4) Proxy runner: point to a server route that accepts { template, variables } and returns { ok, logs, outputs } (default: /api/run-template).

5) CLI runner (mobile/local):

   - Start local bridge: `node mobile/cli-bridge.js`
   - In Template Studio, set Endpoint URL to `http://127.0.0.1:4311/run-template` and select "CLI Bridge".
   - Optional: set `GEMINI_CLI_CMD` env for the bridge to forward payload to your real Gemini CLI.
