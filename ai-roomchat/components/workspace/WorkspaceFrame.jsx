import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CodeWorkspaceProvider } from '../workspace/CodeWorkspaceProvider.jsx';
import dynamic from 'next/dynamic';
import {
  getMonacoLoaderError,
  useMonacoLoaderStatus,
} from './hooks/useMonacoLoaderStatus';

// WorkspaceFrame: fetch workspace set data server-first, then mount CodeWorkspaceProvider consistently.
export default function WorkspaceFrame({ id, children, onReady = () => {} }) {
  const monacoStatus = useMonacoLoaderStatus();
  const monacoError = getMonacoLoaderError();
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
    let ignore = false;
    setLoadState({ status: 'loading', message: null });
    setInitFiles(null);
    setEtag(null);
    (async () => {
      try {
        const r = await fetch(`/api/workspace/sets/${id}`);
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
  }, [id, reloadKey]);

  if (!id) return null;

  if (monacoStatus === 'pending') {
    return <div style={{ padding: 20 }}>Initializing Monaco editor...</div>;
  }

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
      {monacoStatus === 'error' && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #fbbf24',
            background: '#fef3c7',
            color: '#92400e',
            fontSize: 12,
            margin: 8,
          }}
        >
          Monaco editor failed to load. Falling back to the basic editor.
          {monacoError?.message ? ` (${monacoError.message})` : ''}
        </div>
      )}
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
