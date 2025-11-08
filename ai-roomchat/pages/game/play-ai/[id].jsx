import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import PlayScaffold from "../../../components/game/PlayScaffold.jsx";
import { CodeWorkspaceProvider } from '@/components/workspace/CodeWorkspaceProvider.jsx';

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

  const [initFiles, setInitFiles] = useState(null);

  // Load server-first workspace set files for this set id
  useEffect(() => {
    let alive = true;
    if (!id) return;
    (async () => {
      try {
        let r = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`);
        if (!alive) return;
        if (r.ok) {
          const json = await r.json();
          setInitFiles(Array.isArray(json.files) ? json.files : []);
          return;
        }
        if (r.status === 404) { setInitFiles([]); return; }
      } catch {}
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return <div style={{ padding: 20 }}>게임 ID 확인 중…</div>;
  if (!initFiles) return <div style={{ padding: 20 }}>작업공간 불러오는 중…</div>;

  return (
    <CodeWorkspaceProvider key={id || 'default'} storageNamespace={id} initialFiles={initFiles || []}>
      <div style={{ position:'fixed', inset:0 }}>
        <PlayScaffold sessionId={sessionId} gameId={gameId} user={user} character={character} network={network} slotConfig={slotConfig} />
      </div>
    </CodeWorkspaceProvider>
  );
}
