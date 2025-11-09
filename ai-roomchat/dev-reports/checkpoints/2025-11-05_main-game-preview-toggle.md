# Checkpoint — 2025-11-05: MainGame Preview Toggle & Tighter Binding

Scope:
- Maker editor: kept Play overlay; unchanged in this checkpoint.
- WorkspaceOverlay: added right-pane Test preview toggle to switch between Realtime runtime and MainGameMobile UI.
- MainGameMobileUI: wired NextBar timeout policy (auto-next) and CharacterCard tap-cycle behavior from template.ui.main.modules.

Files changed:
- ai-roomchat/components/workspace/WorkspaceOverlay.jsx
- ai-roomchat/components/game/MainGameMobileUI.jsx

Notes:
- Preview toggle persists in localStorage (workspace:preview:mode).
- Next timer resets on manual next; shows countdown label.
- Tap the character card to cycle between desc → abilities → score → image.

Next:
- Optional: integrate SharedChat/realtime gating from UI preset; wire rank submission on end.
