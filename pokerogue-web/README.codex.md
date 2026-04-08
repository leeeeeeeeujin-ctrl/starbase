# Pokerogue web deployment copy

This folder is a deployable copy of `pokerogue-upstream` for static hosting.

Guidelines:
- Set the Vercel project root directory to `pokerogue-web`.
- Build command: `pnpm build`
- Output directory: `dist`
- Install command: default `pnpm install` is fine.
- Do not edit generated files here by hand if the same change should also live in `pokerogue-upstream`.
- Re-run `node scripts/sync-pokerogue-web.mjs` after upstream changes that should be redeployed.
