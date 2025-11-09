import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import createPrompt from '../../../lib/prompts/createPrompt.js';
import { SimpleEditor } from '../../prompts2/[id]/edit.jsx';

export default function MakerLegacy() {
  const router = useRouter();
  const { id } = router.query;
  const ranRef = useRef(false);

  useEffect(() => {
    if (!id || ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try { await createPrompt({ id: String(id), name: String(id) }); } catch (e) { /* no-op */ }
    })();
  }, [id]);

  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      <SimpleEditor id={String(id)} />
    </WorkspaceFrame>
  );
}

