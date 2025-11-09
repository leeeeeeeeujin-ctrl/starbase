'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/components/workspace/CodeWorkspaceProvider.jsx';
import { createSyncChannel, joinSyncChannel, leaveSyncChannel, broadcastPatch, onPatch } from '@/lib/sync/client';

function contentOf(meta){ return typeof meta?.content === 'string' ? meta.content : ''; }

export function useWorkspaceSync(setId){
  const { files, writeFile } = useWorkspace();
  const clientId = useMemo(() => {
    try { return 'c_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); } catch { return 'c_' + Math.random().toString(36).slice(2); }
  }, []);
  const chanRef = useRef(null);
  const lastSigRef = useRef({});
  const skipRef = useRef(false);

  useEffect(() => {
    if (!setId) return;
    const ch = createSyncChannel(setId, { clientId });
    chanRef.current = ch;
    let alive = true;
    (async () => { await joinSyncChannel(ch, { clientId }); })();
    // receive patches
    onPatch(ch, 'vfs_patch', (msg) => {
      try {
        if (!alive || !msg || msg.origin === clientId) return;
        const { path, content } = msg;
        skipRef.current = true;
        writeFile(path, content);
        queueMicrotask(() => { skipRef.current = false; });
      } catch {}
    });
    return () => { alive = false; leaveSyncChannel(ch); chanRef.current = null; };
  }, [setId, clientId, writeFile]);

  useEffect(() => {
    // diff local file contents and broadcast small patches
    const id = setTimeout(() => {
      if (skipRef.current) return;
      const last = lastSigRef.current || {};
      Object.entries(files || {}).forEach(([p, meta]) => {
        const c = contentOf(meta);
        if (last[p] !== c) {
          last[p] = c;
          const ch = chanRef.current; if (!ch) return;
          broadcastPatch(ch, 'vfs_patch', { origin: clientId, path: p, content: c });
        }
      });
      // cleanup removed files signatures
      Object.keys(last).forEach((p) => { if (!files[p]) delete last[p]; });
      lastSigRef.current = last;
    }, 250);
    return () => clearTimeout(id);
  }, [files, clientId]);
}

