# Workspace Play Overlay: Fullscreen Mobile-Friendly Integration

Date: 2025-11-05

Summary:
- Replaced code editor split-pane “테스트” with a fullscreen Play overlay.
- Overlay uses safe-area insets and `--vh` based height to fit mobile browsers.
- Toolbar button now labeled “플레이” and opens the overlay; editor remains full-width.
- Overlay renders `MainGameMobileUI` using `/template.json` (or `templateBinding.text`).
- Removed split/preview mode, ratios, and drag-resizer logic from `WorkspaceOverlay.jsx`.
- Ensured tree behaves in overlay mode; no change to AI Code Chat floating panel.

Files touched:
- `components/workspace/WorkspaceOverlay.jsx`: remove split test; add Play overlay; tidy imports.

Notes:
- Tools dropdown already removed the separate Play entry; Play lives in the code editor toolbar.
- Dev server and tests passed after change.
