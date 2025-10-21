import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import { SessionTurnsPanel } from '@/components/arena/SessionTurnsPanel'

export default function SessionPage() {
  const router = useRouter()
  const sessionId = router.query.sessionId

  useEffect(() => {
    if (!router.isReady || sessionId) return
    router.replace('/arena/queue')
  }, [router, sessionId])

  return (
    <>
      <Head>
        <title>Rank Arcade – 세션</title>
      </Head>
      <ArcadeLayout title={`세션 ${sessionId || ''}`}>
        <SessionTurnsPanel sessionId={sessionId} />
      </ArcadeLayout>
    </>
  )
}
