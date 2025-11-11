"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import UnifiedWorkbench from '../../../components/studio/UnifiedWorkbench.jsx';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';
import { useEffect, useState } from 'react';
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
  const [initFiles, setInitFiles] = useState(null);
  // Retain legacy loading UI states for minimal change; actual loading moved to WorkspaceFrame
  useEffect(() => { setInitFiles([]); }, [id]);

  if (!id || typeof id !== 'string') return <div style={{ padding:20 }}>세트 ID 확인 중…</div>;
  if (!initFiles) return <div style={{ padding:20 }}>작업공간 불러오는 중…</div>;

  return (
    <StudioPersistentProvider>
      <WorkspaceFrame id={id}>
        {useUnified ? <UnifiedWorkbench /> : <MakerEditor />}
      </WorkspaceFrame>
      <LoginDebugOverlay scope={`maker:${id}`} />
    </StudioPersistentProvider>
  );
}
