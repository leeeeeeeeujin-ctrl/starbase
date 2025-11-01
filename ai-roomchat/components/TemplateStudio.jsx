import dynamic from 'next/dynamic';
import PersistentTemplateProvider from '../contexts/PersistentTemplateProvider.jsx';

const ThreeInOneStudio = dynamic(() => import('./studio/ThreeInOneStudio'), { ssr: false });

export default function TemplateStudio() {
  return (
    <PersistentTemplateProvider>
      <ThreeInOneStudio />
    </PersistentTemplateProvider>
  );
}

