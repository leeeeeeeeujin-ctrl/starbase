"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';
import { useCallback, useEffect, useState } from 'react';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';

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

  if (!id || typeof id !== 'string') return <div style={{ padding: 20 }}>Checking workspace id...</div>;

  const renderWorkbench = workspaceReady
    ? <MakerEditor />
    : <div style={{ padding: 24 }}>Preparing workspace...</div>;

  return (
    <StudioPersistentProvider key={id}>
      <WorkspaceFrame id={id} onReady={handleWorkspaceReady}>
        {renderWorkbench}
      </WorkspaceFrame>
    </StudioPersistentProvider>
  );
}
