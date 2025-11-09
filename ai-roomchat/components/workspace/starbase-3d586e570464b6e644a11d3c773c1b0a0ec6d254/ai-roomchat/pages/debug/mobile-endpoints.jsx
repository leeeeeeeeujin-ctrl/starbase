import dynamic from 'next/dynamic';

const MobileEndpointsDebug = dynamic(() => import('../../components/debug/MobileEndpointsDebug'), { ssr: false });

export default function Page() {
  return <MobileEndpointsDebug />;
}
