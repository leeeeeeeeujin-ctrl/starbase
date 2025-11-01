import dynamic from 'next/dynamic';
import StudioPersistentProvider from '../contexts/StudioPersistentProvider.jsx';

const ThreeInOneStudio = dynamic(() => import('../components/studio/ThreeInOneStudio'), { ssr: false });

export default function StudioPage() {
  return (
    <StudioPersistentProvider>
      <ThreeInOneStudio />
    </StudioPersistentProvider>
  );
}
