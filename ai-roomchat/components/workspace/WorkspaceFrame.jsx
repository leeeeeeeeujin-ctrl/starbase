import React, { useEffect, useState } from 'react';
import { CodeWorkspaceProvider } from '../workspace/CodeWorkspaceProvider.jsx';

// WorkspaceFrame: 서버-우선으로 세트 파일을 불러와 CodeWorkspaceProvider를 일관되게 마운트합니다.
// - id: 프롬프트/세트 id (storageNamespace와 키에 사용)
// - children: Provider 하위에서만 동작해야 하는 편집/플레이 UI
export default function WorkspaceFrame({ id, children }) {
  const [initFiles, setInitFiles] = useState(null);
  const [etag, setEtag] = useState(null);

  useEffect(() => {
    if (!id) return;
    let ignore = false;
    (async () => {
      try {
        const r = await fetch(`/api/workspace/sets/${id}`);
        if (ignore) return;
        if (r.status === 200) {
          // API returns a record { id, files: [], meta, etag }
          const json = await r.json();
          const files = Array.isArray(json?.files) ? json.files : [];
          setInitFiles(files);
          // Prefer ETag header, fallback to record.etag if present
          setEtag(r.headers.get('ETag') || json?.etag || null);
        } else if (r.status === 404) {
          // 첫 저장 전이면 404가 정상. 빈 VFS로 시작.
          setInitFiles([]);
          setEtag(null);
        } else {
          console.warn('[WorkspaceFrame] GET failed', r.status);
          setInitFiles([]);
          setEtag(null);
        }
      } catch (err) {
        console.warn('[WorkspaceFrame] GET error', err);
        setInitFiles([]);
        setEtag(null);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  if (!id) return null;
  if (initFiles == null) return null; // 간단한 로딩 상태

  return (
    <CodeWorkspaceProvider
      key={id}
      storageNamespace={id}
      initialFiles={initFiles}
      initialEtag={etag}
    >
      {children}
    </CodeWorkspaceProvider>
  );
}

