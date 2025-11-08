import React from "react";
import GameSessionShell from "./GameSessionShell.jsx";
import GameCanvasSlot from "./slots/GameCanvasSlot.jsx";
import InGameChatOverlay from "./chat/InGameChatOverlay.jsx";
import VirtualControls from "./controls/VirtualControls.jsx";
import { createAIAdapter } from "../../lib/game/ai/types.js";
import { createAIOrchestrator } from "../../lib/game/ai/AIOrchestrator.js";
import { useCharacter } from "../../lib/game/context/CharacterContext.jsx";
import { useInGameChat } from "./chat/InGameChatProvider.jsx";
import { useFeatureFlags } from "../../lib/game/config/featureFlags.js";

function useAI({ sessionId, gameId, chat, network }) {
  const aiAdapter = React.useMemo(() => createAIAdapter({
    async invoke({ prompt, sessionId, gameId }) {
      const res = await fetch('/api/ai/proxy', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, sessionId, gameId }) });
      const json = await res.json();
      return { text: json.text };
    }
  }), []);
  return React.useMemo(() => createAIOrchestrator({ aiAdapter, chat, network, sessionId, gameId }), [aiAdapter, chat, network, sessionId, gameId]);
}

export default function PlayScaffold({ sessionId, gameId, user, character, network, slotConfig }) {
  const flags = useFeatureFlags();
  return (
    <GameSessionShell sessionId={sessionId} gameId={gameId} user={user} character={character} network={network} autoLoadReference={flags.characterAutoload}>
      <ScaffoldContent sessionId={sessionId} gameId={gameId} user={user} network={network} slotConfig={slotConfig} flags={flags} />
    </GameSessionShell>
  );
}

function ScaffoldContent({ sessionId, gameId, user, network, slotConfig, flags }) {
  const viewer = { id: user?.id, role: user?.role, characterId: user?.characterId, slotId: 'main' };
  const character = useCharacter();
  const chat = useInGameChat();
  const ai = useAI({ sessionId, gameId, chat, network });

  // example: kick off a prompt on mount
  React.useEffect(() => {
    if (!ai || !flags.ai) return;
    ai.runPrompt({ template: 'Welcome {{character.name}}! Prepare for battle.', character, audience: ['all'], timeoutMs: 5000 }).catch(() => {});
  }, [ai, character, flags.ai]);

  return (
    <div style={{ position:'relative', width:'100%', height:'100%' }}>
      {flags.canvas && (
        <GameCanvasSlot slotConfig={slotConfig} sessionId={sessionId} gameId={gameId} character={character} network={network} />
      )}
      {flags.chat && <InGameChatOverlay channel="ai" viewer={viewer} />}
      {flags.chat && <InGameChatOverlay channel="party" viewer={viewer} />}
      {flags.mobileControls && <VirtualControls onInput={(ev) => {/* adapter.onInput wired in host */}} />}
    </div>
  );
}
