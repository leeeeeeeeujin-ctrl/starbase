import React from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import { SimpleEditor } from '../../prompts2/[id]/edit.jsx';

export default function Maker2Index() {
  const router = useRouter();
  const { id } = router.query;
  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      {/* 재사용: 동일한 심플 에디터를 Maker2에서도 사용 */}
      <SimpleEditor id={String(id)} />
    </WorkspaceFrame>
  );
}
