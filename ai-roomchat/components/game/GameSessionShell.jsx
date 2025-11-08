import React from "react";
import { CharacterProvider } from "../../lib/game/context/CharacterContext.jsx";
import { InGameChatProvider } from "./chat/InGameChatProvider.jsx";
import { loadReferenceJSON } from "../../lib/game/reference/referenceData.js";

// Wraps children with Character + In‑Game Chat providers.
export default function GameSessionShell({ children, sessionId, gameId, user, character, network, autoLoadReference = false }) {
  const [charState, setCharState] = React.useState(character || null);

  React.useEffect(() => { setCharState(character || null); }, [character]);

  React.useEffect(() => {
    if (charState || !autoLoadReference) return;
    let alive = true;
    loadReferenceJSON("character.sample").then((data) => { if (alive) setCharState(data); }).catch(() => {});
    return () => { alive = false; };
  }, [autoLoadReference, charState]);

  return (
    <InGameChatProvider sessionId={sessionId} gameId={gameId} networkAdapter={network} currentUser={user}>
      <CharacterProvider value={charState || {}}>{children}</CharacterProvider>
    </InGameChatProvider>
  );
}
