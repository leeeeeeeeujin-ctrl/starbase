import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { ArcadeLayout } from '@/components/arena/ArcadeLayout';
import { ScoreSummaryPanel } from '@/components/arena/ScoreSummaryPanel';

export default function SessionScorePage() {
  const router = useRouter();
  const sessionId = router.query.sessionId;

  useEffect(() => {
    if (!router.isReady || sessionId) return;
    router.replace('/arena/queue');
  }, [router, sessionId]);

  return (
    <>
      <Head>
        <title>Rank Arcade – 정산</title>
      </Head>
      <ArcadeLayout title={`정산 ${sessionId || ''}`}>
        <ScoreSummaryPanel sessionId={sessionId} />
      </ArcadeLayout>
    </>
  );
}
