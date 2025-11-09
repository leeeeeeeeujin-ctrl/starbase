import React from "react";
import GameSessionShell from "./GameSessionShell.jsx";
import InGameChatOverlay from "./chat/InGameChatOverlay.jsx";
import { useFeatureFlags } from "../../lib/game/config/featureFlags.js";

// Non-invasive parity layer for the main game page.
// Wrap your existing page tree with this to provide the same providers/overlays as PlayScaffold.

export default function MainGameParity({ children, sessionId, gameId, user, character, network, viewer }) {
  const flags = useFeatureFlags();
  return (
    <GameSessionShell sessionId={sessionId} gameId={gameId} user={user} character={character} network={network} autoLoadReference={flags.characterAutoload}>
      {children}
      {flags.chat && <InGameChatOverlay channel="ai" viewer={viewer} />}
      {flags.chat && <InGameChatOverlay channel="party" viewer={viewer} />}
    </GameSessionShell>
  );
}

