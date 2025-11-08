import dynamic from 'next/dynamic';
import StudioPersistentProvider from '../contexts/StudioPersistentProvider.jsx';

// 사용 중인 프롬프트 편집 루트에 최신 편집 UX(프롬프트↔코드 전환, AI 화살표, Runner, 이미지 UI/블록코딩)를 결합합니다.
const ThreeInOneStudio = dynamic(() => import('./studio/ThreeInOneStudio'), { ssr: false });

export default function TemplateStudio() {
  return (
    <StudioPersistentProvider>
      <ThreeInOneStudio />
    </StudioPersistentProvider>
  );
}
