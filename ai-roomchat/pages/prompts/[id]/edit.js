import React from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import { SimpleEditor } from '../../prompts2/[id]/edit.jsx';

export default function PromptEditLegacy() {
  const router = useRouter();
  const { id } = router.query;
  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      <SimpleEditor id={String(id)} />
    </WorkspaceFrame>
  );
}

