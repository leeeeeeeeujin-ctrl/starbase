import dynamic from 'next/dynamic';
const OffloadDebug = dynamic(() => import('../../components/debug/OffloadDebug'), { ssr: false });
export default function Page(){
  return <OffloadDebug/>;
}
