import React from "react";
import { useRouter } from "next/router";
import PlayScaffold from "../../../components/game/PlayScaffold.jsx";

export default function PlayAIPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const sessionId = React.useMemo(() => `s_${id || 'dev'}`, [id]);
  const gameId = id || "dev";

  // Placeholder user; replace with real auth/session.
  const user = { id: "u_demo", name: "Demo", role: "player", characterId: "c_demo" };
  const character = null; // GameSessionShell will auto load reference sample when null

  // Network adapter can be plugged in later; for now null.
  const network = null;

  // Slot config can inject a custom adapterFactory; exampleAdapter is default if omitted.
  const slotConfig = { adapterFactory: undefined, options: {} };

  return (
    <div style={{ position:'fixed', inset:0 }}>
      <PlayScaffold sessionId={sessionId} gameId={gameId} user={user} character={character} network={network} slotConfig={slotConfig} />
    </div>
  );
}

