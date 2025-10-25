// pages/rank/[id]/manual-console.js
import dynamic from 'next/dynamic';

const NonRealtimeConsole = dynamic(() => import('../../../components/rank/NonRealtimeConsole'), {
  ssr: false,
});

export default function ManualConsolePage() {
  return <NonRealtimeConsole />;
}
