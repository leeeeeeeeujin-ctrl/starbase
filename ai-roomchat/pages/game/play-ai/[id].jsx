import React from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';

export default function PlayAIPage() {
  const router = useRouter();
  const { id } = router.query;
  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      <div style={{ color:'#e2e8f0', background:'#0b1220', height:'100vh' }}>
        {/* AI Play runtime mounted under WorkspaceFrame */}
      </div>
    </WorkspaceFrame>
  );
}

