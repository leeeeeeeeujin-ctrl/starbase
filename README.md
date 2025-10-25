# Starbase

This repo contains the Next.js + Supabase AI RoomChat app and supporting tooling.

## Codespaces Quickstart

Use GitHub Codespaces for a reliable, OS-agnostic dev environment.

- Open this repo in GitHub, click the green "Code" button → "Codespaces" → "Create codespace on main".
- On first boot, the dev container will run `npm ci` automatically in `ai-roomchat/starbase/ai-roomchat`.
- Port 3000 is pre-forwarded; the admin password is pre-set to `localdev` inside the container.
- The dev server auto-starts on folder open via a VS Code automatic task (you can see/stop it from Terminal → Run Task…).

### Run the dev server

- VS Code task: `Terminal → Run Task… → app: dev`
- Or run in the integrated terminal:

```bash
cd ai-roomchat/starbase/ai-roomchat
HOST=0.0.0.0 PORT=3000 ADMIN_PORTAL_PASSWORD=localdev npm run dev
```

The server will be available on the forwarded port 3000. Codespaces should auto-open it.

### Run unit tests and utilities

From the `ai-roomchat/starbase/ai-roomchat` folder:

```bash
npm test
npm run test:samples    # runs sample matcher scenarios and writes reports/matching-samples.json
npm run test:fuzz       # runs the matcher fuzzer
```

### CI

GitHub Actions workflow `.github/workflows/match-tests.yml` runs unit tests and the fuzzer on push/PR and can be dispatched manually.

### Notes

- The devcontainer sets `ADMIN_PORTAL_PASSWORD=localdev` and forwards port 3000.
- If you add new dependencies, run `npm i <pkg>` in `ai-roomchat/starbase/ai-roomchat` and commit the updated package-lock.
