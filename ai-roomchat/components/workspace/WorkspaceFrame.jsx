import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CodeWorkspaceProvider } from '../workspace/CodeWorkspaceProvider.jsx';
import dynamic from 'next/dynamic';
import { useSupabaseSessionToken } from './hooks/useSupabaseSessionToken';
import { applySupabaseAccessToken } from '../../lib/api/authHeaders';
import { syncPromptGraphToVfs } from '../../lib/workspace/syncPromptGraphToVfs';

// WorkspaceFrame: fetch workspace set data server-first, then mount CodeWorkspaceProvider consistently.
export default function WorkspaceFrame({ id, children, onReady = () => {} }) {
  const { token: sessionToken, loading: sessionLoading } = useSupabaseSessionToken();
  const [initFiles, setInitFiles] = useState(null);
  const [etag, setEtag] = useState(null);
  const [loadState, setLoadState] = useState({ status: 'idle', message: null });
  const [reloadKey, setReloadKey] = useState(0);
  const readySignaledRef = useRef(false);

  useEffect(() => {
    readySignaledRef.current = false;
  }, [id, reloadKey]);

  useEffect(() => {
    if (
      initFiles == null ||
      loadState.status !== 'ready' ||
      readySignaledRef.current
    ) {
      return;
    }
    readySignaledRef.current = true;
    try {
      onReady();
    } catch (err) {
      console.warn('[WorkspaceFrame] onReady callback failed', err);
    }
  }, [initFiles, loadState.status, onReady]);

  const handleRetry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!id) return;
    // Supabase 세션 로딩이 끝난 뒤에만 첫 GET을 시도한다.
    if (sessionLoading) return;
    let ignore = false;
    setLoadState({ status: 'loading', message: null });
    setInitFiles(null);
    setEtag(null);

    (async () => {
      try {
        const headers = applySupabaseAccessToken({}, sessionToken);
        const r = await fetch(`/api/workspace/sets/${id}`, { headers });
        if (ignore) return;
        if (r.status === 200) {
          const json = await r.json();
          let files = Array.isArray(json?.files) ? json.files : [];
          if (!files.length && process.env.NEXT_PUBLIC_WORKSPACE_AUTOINIT === '1') {
            try {
              const sp = await fetch('/api/workspace/starter-pack');
              if (sp.ok) {
                const sj = await sp.json();
                const sfiles = Array.isArray(sj?.files) ? sj.files : [];
                if (sfiles.length) files = sfiles;
              }
            } catch {
              // ignore starter pack failure; keep existing files array
            }
          }
          
          // Studio → workspace 단방향 sync: Supabase 그래프를 /graph 로 동기화
          try {
            files = await syncPromptGraphToVfs(files, id);
          } catch (syncErr) {
            console.warn('[WorkspaceFrame] syncPromptGraphToVfs failed', syncErr);
            // 동기화 실패해도 워크스페이스는 계속 로드한다
          }
          
          setInitFiles(files);
          setEtag(r.headers.get('ETag') || json?.etag || null);
          setLoadState({ status: 'ready', message: null });
          return;
        }
        if (r.status === 404) {
          let files = [];
          if (process.env.NEXT_PUBLIC_WORKSPACE_AUTOINIT === '1') {
            try {
              const sp = await fetch('/api/workspace/starter-pack');
              if (sp.ok) {
                const sj = await sp.json();
                const sfiles = Array.isArray(sj?.files) ? sj.files : [];
                if (sfiles.length) files = sfiles;
              }
            } catch {
              // ignore starter pack failure
            }
          }
          
          // 새 세트도 Supabase 그래프 동기화 시도
          try {
            files = await syncPromptGraphToVfs(files, id);
          } catch (syncErr) {
            console.warn('[WorkspaceFrame] syncPromptGraphToVfs failed for new set', syncErr);
          }
          
          setInitFiles(files);
          setEtag(null);
          setLoadState({ status: 'ready', message: null });
          return;
        }
        console.warn('[WorkspaceFrame] GET failed', r.status);
        setLoadState({
          status: 'error',
          message: `Failed to load workspace (HTTP ${r.status})`,
        });
      } catch (err) {
        console.warn('[WorkspaceFrame] GET error', err);
        setLoadState({
          status: 'error',
          message: err?.message || 'Failed to load workspace',
        });
      }
    })();

    return () => {
      ignore = true;
    };
    // 의도적으로 sessionToken 을 의존성에서 제외하여
    // 워크스페이스가 토큰 갱신마다 다시 로드되는 것을 방지한다.
    // sessionLoading 이 false 로 전환될 때 한 번은 실행되어야 하므로 포함한다.
  }, [id, reloadKey, sessionLoading]);

  if (!id) return null;

  if (initFiles == null) {
    return (
      <div style={{ padding: 20 }}>
        {loadState.status === 'error' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: '#f97316' }}>
              {loadState.message || 'Failed to load workspace files.'}
            </div>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                alignSelf: 'flex-start',
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #f97316',
                background: '#111827',
                color: '#f8fafc',
                fontSize: 13,
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          'Loading workspace files...'
        )}
      </div>
    );
  }

  return (
    <CodeWorkspaceProvider
      key={`${id}:${reloadKey}`}
      storageNamespace={id}
      initialFiles={initFiles}
      initialEtag={etag}
    >
      {process.env.NEXT_PUBLIC_SYNC_EXPERIMENT === '1' ? (
        (() => {
          const SyncMount = dynamic(() => import('./WorkspaceSyncMount.jsx'), { ssr: false });
          return <SyncMount id={id} />;
        })()
      ) : null}
      {(() => {
        const CapsMount = dynamic(() => import('./CapabilitiesMount.jsx'), { ssr: false });
        return <CapsMount />;
      })()}
      {(() => {
        const Toast = dynamic(() => import('../common/ToastMount.jsx'), { ssr: false });
        return <Toast />;
      })()}
      {children}
    </CodeWorkspaceProvider>
  );
}
