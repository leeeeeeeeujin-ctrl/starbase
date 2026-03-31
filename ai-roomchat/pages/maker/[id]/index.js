"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';
import { useCallback, useEffect, useState } from 'react';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import LoginDebugOverlay from '../../../components/common/LoginDebugOverlay.jsx';

export default function MakerEditorPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const handleWorkspaceReady = useCallback(() => {
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    setWorkspaceReady(false);
  }, [id]);

  // Debug mount/unmount for the page wrapper
  useEffect(() => {
    try {
      console.log('[MakerEditorPage] mount', { id });
    } catch {}
    return () => {
      try {
        console.log('[MakerEditorPage] unmount', { id });
      } catch {}
    };
  }, [id]);

  if (!id || typeof id !== 'string') return <div style={{ padding: 20 }}>Checking workspace id...</div>;

  const renderWorkbench = workspaceReady
    ? <MakerEditor />
    : <div style={{ padding: 24 }}>Preparing workspace...</div>;

  return (
    <StudioPersistentProvider>
      <WorkspaceFrame id={id} onReady={handleWorkspaceReady}>
        {renderWorkbench}
      </WorkspaceFrame>
      {workspaceReady && <LoginDebugOverlay scope={`maker:${id}`} />}
    </StudioPersistentProvider>
  );
}
