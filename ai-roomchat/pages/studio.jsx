import dynamic from 'next/dynamic';
import PersistentTemplateProvider from '../contexts/PersistentTemplateProvider.jsx';

const ThreeInOneStudio = dynamic(() => import('../components/studio/ThreeInOneStudio'), { ssr: false });

export default function StudioPage() {
  return (
    <PersistentTemplateProvider>
      <ThreeInOneStudio />
    </PersistentTemplateProvider>
  );
}
