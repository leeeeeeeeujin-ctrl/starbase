import Head from 'next/head';
import { ArcadeLayout } from '@/components/arena/ArcadeLayout';
import { QueuePanel } from '@/components/arena/QueuePanel';

export default function QueuePage() {
  return (
    <>
      <Head>
        <title>Rank Arcade – 큐</title>
      </Head>
      <ArcadeLayout title="큐 대기">
        <QueuePanel />
      </ArcadeLayout>
    </>
  );
}
