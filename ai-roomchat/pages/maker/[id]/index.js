"use client";

import { useRouter } from 'next/router';
import MakerEditor from '../../../components/maker/editor/MakerEditor';
import UnifiedWorkbench from '../../../components/studio/UnifiedWorkbench.jsx';
import StudioPersistentProvider from '../../../contexts/StudioPersistentProvider.jsx';

export default function MakerEditorPage() {
  const router = useRouter();
  const useUnified = router?.query?.unified === '1' || router?.query?.studio === '1';
  return (
    <StudioPersistentProvider>
      {useUnified ? <UnifiedWorkbench /> : <MakerEditor />}
    </StudioPersistentProvider>
  );
}
