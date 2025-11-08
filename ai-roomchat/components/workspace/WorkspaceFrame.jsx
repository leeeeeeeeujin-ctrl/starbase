"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CodeWorkspaceProvider } from './CodeWorkspaceProvider.jsx';

export default function WorkspaceFrame({ id: propId, children, fallback = null }) {
  const router = useRouter();
  const routeId = router?.query?.id;
  const id = String(propId || routeId || '');
  const [initFiles, setInitFiles] = useState(null);
  const [etag, setEtag] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    (async () => {
      try {
        let r = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`);
        if (!alive) return;
        if (r.ok) {
          const j = await r.json();
          setInitFiles(Array.isArray(j.files) ? j.files : []);
          setEtag(j.etag || null);
          return;
        }
        if (r.status === 404) { setInitFiles([]); setEtag(null); return; }
      } catch {
        setInitFiles([]); setEtag(null);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return fallback || <div style={{ padding: 20 }}>세트 ID 확인 중…</div>;
  if (!initFiles) return fallback || <div style={{ padding: 20 }}>작업공간 불러오는 중…</div>;

  return (
    <CodeWorkspaceProvider key={id} storageNamespace={id} initialFiles={initFiles}>
      {typeof children === 'function' ? children({ etag, setEtag, id }) : children}
    </CodeWorkspaceProvider>
  );
}

