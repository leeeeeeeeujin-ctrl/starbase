import Head from 'next/head'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import { OpsPanel } from '@/components/arena/OpsPanel'

export default function ControlPage() {
  return (
    <>
      <Head>
        <title>Rank Arcade – 운영</title>
      </Head>
      <ArcadeLayout title="운영 도구">
        <OpsPanel />
      </ArcadeLayout>
    </>
  )
}
