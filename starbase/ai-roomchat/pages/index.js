import Link from 'next/link'
import Head from 'next/head'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import styles from '@/styles/ArcadeHome.module.css'

const sections = [
  {
    title: '1. 큐 진입',
    body: '대기열에서 자리를 예약하고 실시간으로 자리 배정을 확인합니다.',
    href: '/arena/queue',
  },
  {
    title: '2. 준비 투표',
    body: '15초 제한 카운트다운 동안 모든 참가자가 준비 상태를 확정합니다.',
    href: '/arena/staging',
  },
  {
    title: '3. 본게임',
    body: '세션별 턴 로그와 슬롯 가시성 옵션을 확인합니다.',
    href: '/arena/sessions/demo-session',
  },
  {
    title: '4. 정산',
    body: '전투 종료 후 점수·보상 정산을 검증합니다.',
    href: '/arena/sessions/demo-session/score',
  },
  {
    title: '5. 운영',
    body: '큐 리셋, publication 검사 등 운영 도구를 실행합니다.',
    href: '/arena/control',
  },
]

export default function ArcadeHome() {
  return (
    <>
      <Head>
        <title>Rank Arcade – Realtime Match Skeleton</title>
      </Head>
      <ArcadeLayout title="Rank Arcade">
        <section className={styles.hero}>
          <h2>방 대신 세션 중심으로 재구성한 매칭 흐름</h2>
          <p>
            모든 상호작용을 Supabase RPC와 Realtime으로 일치시키고, 여섯 개의 페이지로 핵심
            운영만 남겼습니다.
          </p>
        </section>
        <section className={styles.grid}>
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className={styles.card}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </Link>
          ))}
        </section>
      </ArcadeLayout>
    </>
  )
}
