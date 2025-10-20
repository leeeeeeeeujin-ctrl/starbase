import Head from 'next/head'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import { ReadyVotePanel } from '@/components/arena/ReadyVotePanel'

export default function StagingPage() {
  return (
    <>
      <Head>
        <title>Rank Arcade – 준비 투표</title>
      </Head>
      <ArcadeLayout title="준비 투표">
        <ReadyVotePanel />
      </ArcadeLayout>
    </>
  )
}
