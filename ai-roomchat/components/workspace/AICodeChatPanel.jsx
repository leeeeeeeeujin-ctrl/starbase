"use client";

import AIChatDock from './AIChatDock.jsx';

/**
 * Compatibility wrapper so existing overlays that reference AICodeChatPanel
 * continue to work. The new AIChatDock handles the actual UI/logic.
 */
export default function AICodeChatPanel({
  onClose,
  onDragHandleDown, // legacy props ignored
  onToggleFullscreen,
  onMinimize,
  enableFullscreenButton,
  enableMinimizeButton,
}) {
  return (
    <AIChatDock
      onClose={onClose}
      onDragHandleDown={onDragHandleDown}
      onToggleFullscreen={onToggleFullscreen}
      onMinimize={onMinimize}
      enableFullscreenButton={enableFullscreenButton}
      enableMinimizeButton={enableMinimizeButton}
    />
  );
}
