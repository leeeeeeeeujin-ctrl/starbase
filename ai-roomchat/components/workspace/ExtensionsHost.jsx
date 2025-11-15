import React, { useEffect, useState } from 'react';
import { loadExtensionsMeta, saveExtensionsMeta } from '../../lib/workspace/extensionsMeta.js';

export default function ExtensionsHost() {
  const [open, setOpen] = useState(false);
  const [Modal, setModal] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [extensions, setExtensions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      if (typeof globalThis !== 'undefined') {
        if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
        // Back-compat alias
        if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
      }
    } catch {}
  }, []);

  useEffect(() => {
    function handleOpen(payload) {
      try {
        let nextId = null;
        if (payload && typeof payload === 'object' && 'workspaceId' in payload) {
          nextId = payload.workspaceId || null;
        } else if (typeof payload === 'string') {
          nextId = payload || null;
        }
        if (nextId) setWorkspaceId(nextId);
      } catch {
        // ignore malformed payloads
      }
      setOpen(true);
    }
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('ai:open-extensions', handleOpen);
    // Expose a helper for programmatic open
    window.starbaseOpenExtensions = handleOpen;
    return () => {
      window.removeEventListener('ai:open-extensions', handleOpen);
      try { delete window.starbaseOpenExtensions; } catch {}
    };
  }, []);

  useEffect(() => {
    if (!open || Modal) return;
    import('./ExtensionInstallModal')
      .then((m) => setModal(() => m.default))
      .catch(() => {});
  }, [open, Modal]);

  useEffect(() => {
    if (!open) return;
    if (!workspaceId) {
      setExtensions([]);
      return;
    }
    if (extensions !== null || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadExtensionsMeta(workspaceId)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.extensions) ? data.extensions : [];
        setExtensions(list);
        try {
          if (typeof window !== 'undefined') {
            const map = (window.__workspaceExtensions = window.__workspaceExtensions || {});
            map[workspaceId] = list;
          }
        } catch {
          // ignore cache errors
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || '확장 설정을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, extensions, loading]);

  async function handleChangeExtensions(nextList) {
    setExtensions(nextList);
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      await saveExtensionsMeta(workspaceId, nextList);
      try {
        if (typeof window !== 'undefined') {
          const map = (window.__workspaceExtensions = window.__workspaceExtensions || {});
          map[workspaceId] = nextList;
          window.dispatchEvent &&
            window.dispatchEvent(
              new CustomEvent('workspace:extensions-updated', {
                detail: { workspaceId, extensions: nextList },
              }),
            );
        }
      } catch {
        // ignore cross-window errors
      }
    } catch (err) {
      setError(err?.message || '확장 설정 저장에 실패했습니다.');
      // keep local state but surface error; caller may choose to retry
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const ExtensionInstallModal = Modal;
  if (!ExtensionInstallModal) return null;
  return (
    <ExtensionInstallModal
      open={open}
      onClose={() => setOpen(false)}
      workspaceId={workspaceId}
      extensions={extensions || []}
      loading={loading}
      saving={saving}
      error={error}
      onChangeExtensions={handleChangeExtensions}
    />
  );
}

