"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import UnifiedWorkbench from '../../../components/studio/UnifiedWorkbench.jsx';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';
import { useCallback, useEffect, useState } from 'react';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import LoginDebugOverlay from '../../../components/common/LoginDebugOverlay.jsx';

export default function MakerEditorPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const q = router?.query || {};
  const hasModeParam = typeof q.unified !== 'undefined' || typeof q.studio !== 'undefined';
  const defaultUnified = (
    process.env.NEXT_PUBLIC_WORKBENCH_DEFAULT === 'studio' ||
    process.env.NEXT_PUBLIC_WORKBENCH_UNIFIED === '1'
  );
  const useUnified = hasModeParam ? (q.unified === '1' || q.studio === '1') : defaultUnified; // default follows env, otherwise original Maker-only
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const handleWorkspaceReady = useCallback(() => {
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    setWorkspaceReady(false);
  }, [id]);

  if (!id || typeof id !== 'string') return <div style={{ padding: 20 }}>Checking workspace id...</div>;

  const renderWorkbench = workspaceReady
    ? (useUnified ? <UnifiedWorkbench /> : <MakerEditor />)
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
