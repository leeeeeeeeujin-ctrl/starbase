"use client";

import MakerEditor from '../../../components/maker/editor/MakerEditor';
import StudioPersistentProvider from '../../../components/contexts/StudioPersistentProvider.jsx';

export default function MakerEditorPage() {
  return (
    <StudioPersistentProvider>
      <MakerEditor />
    </StudioPersistentProvider>
  );
}
