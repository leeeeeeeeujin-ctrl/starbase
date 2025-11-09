import React from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';

function GameStub() {
  return (
    <div style={{ color:'#e2e8f0', background:'#0b1220', height:'100vh', display:'grid', placeItems:'center' }}>
      <div>Game Runtime Placeholder — workspace mounted</div>
    </div>
  );
}

export default function Game2Play() {
  const router = useRouter();
  const { id } = router.query;
  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      <GameStub />
    </WorkspaceFrame>
  );
}

