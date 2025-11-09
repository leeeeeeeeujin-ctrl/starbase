"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import UnifiedWorkbench from '../../../components/studio/UnifiedWorkbench.jsx';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';
import { useEffect, useState } from 'react';
import { CodeWorkspaceProvider } from '../../../components/workspace/CodeWorkspaceProvider.jsx';

export default function MakerEditorPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const q = router?.query || {};
  const hasModeParam = typeof q.unified !== 'undefined' || typeof q.studio !== 'undefined';
  const useUnified = hasModeParam ? (q.unified === '1' || q.studio === '1') : true; // default to unified workbench
  const [initFiles, setInitFiles] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!id || typeof id !== 'string') return;
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
      } catch {
        setInitFiles([]);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id || typeof id !== 'string') return <div style={{ padding:20 }}>세트 ID 확인 중…</div>;
  if (!initFiles) return <div style={{ padding:20 }}>작업공간 불러오는 중…</div>;

  return (
    <StudioPersistentProvider>
      <CodeWorkspaceProvider key={id} storageNamespace={id} initialFiles={initFiles}>
        {useUnified ? <UnifiedWorkbench /> : <MakerEditor />}
      </CodeWorkspaceProvider>
    </StudioPersistentProvider>
  );
}
