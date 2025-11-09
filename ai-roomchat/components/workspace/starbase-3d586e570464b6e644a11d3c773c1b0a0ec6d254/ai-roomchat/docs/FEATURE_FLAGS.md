# Game Feature Flags

Purpose: toggle runtime features on/off while keeping parity between editor Play and Main Game.

Module
- `lib/game/config/featureFlags.js` → `useFeatureFlags()` and `getFeatureFlags()`

Defaults (all on)
- `canvas`, `chat`, `ai`, `mobileControls`, `characterAutoload`

Overrides
- Env vars (Next public):
  - `NEXT_PUBLIC_GAME_CANVAS`, `NEXT_PUBLIC_GAME_CHAT`, `NEXT_PUBLIC_GAME_AI`, `NEXT_PUBLIC_GAME_MOBILE`, `NEXT_PUBLIC_GAME_CHAR_AUTOLOAD`
  - Values: `1|true|on|yes` to enable, otherwise disable
- URL query:
  - `?ff=canvas,chat,ai` (only listed = on, others off)
  - or `?chat=0&ai=1` for explicit booleans

Usage
- Play scaffold uses flags to conditionally render canvas/chat/mobile and to auto‑load character.
- Main game can wrap its tree with `components/game/MainGameParity.jsx` to get the same providers/overlays.

