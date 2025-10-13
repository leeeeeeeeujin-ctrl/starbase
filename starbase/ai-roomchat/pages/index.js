import Link from 'next/link'
import Head from 'next/head'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import styles from '@/styles/ArcadeHome.module.css'

const arenaSections = [
  {
    title: '1. 큐 진입',
    body: '대기열 RPC로 자리 예약 후 실시간으로 배정과 상태 변화를 확인합니다.',
    href: '/arena/queue',
  },
  {
    title: '2. 준비 투표',
    body: '15초 카운트다운 동안 모두가 준비 완료를 확정하면 자동으로 본게임을 개시합니다.',
    href: '/arena/staging',
  },
  {
    title: '3. 본게임',
    body: '세션 턴 로그·가시성 옵션·AI 응답 기록을 한 화면에서 모니터링합니다.',
    href: '/arena/sessions/demo-session',
  },
  {
    title: '4. 정산',
    body: '전투 종료 후 점수와 보상을 검증하고 후속 자동화를 점검합니다.',
    href: '/arena/sessions/demo-session/score',
  },
  {
    title: '5. 운영',
    body: '큐 리셋과 publication 검사 등 운영 도구를 실행합니다.',
    href: '/arena/control',
  },
]

const projectSections = [
  {
    title: '로비',
    body: '기존 로비 UI에서 현재 공개 방과 이벤트를 둘러봅니다.',
    href: '/lobby',
  },
  {
    title: '방 목록',
    body: 'Rank Room UI로 돌아가 슬롯·참여자·투표 흐름을 확인합니다.',
    href: '/rooms',
  },
  {
    title: '로스터',
    body: '참가자/캐릭터 배치를 관리하던 원래의 로스터 편집 도구입니다.',
    href: '/roster',
  },
  {
    title: '캐릭터·메이커',
    body: '메이커 편집기와 캐릭터 등록 경로를 유지해 제작 파이프라인을 계속 사용할 수 있습니다.',
    href: '/maker',
  },
  {
    title: '메인룸',
    body: '기존 메인 게임 클라이언트(Play)로 바로 이동합니다.',
    href: '/play',
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
          <h2>세션 중심 아케이드를 도입하면서도 기존 공간은 그대로</h2>
          <p>
            새로운 Arena 흐름은 RPC·Realtime 중심으로 축약했지만, 로스터·로비·메이커 등 기존
            페이지도 한 번에 접근할 수 있도록 허브를 재구성했습니다.
          </p>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Arcade 매칭 흐름</h3>
            <p>큐 → 준비 → 본게임 → 정산을 따라가며 새 세션 구조를 시험해 보세요.</p>
          </div>
          <div className={styles.grid}>
            {arenaSections.map((section) => (
              <Link key={section.href} href={section.href} className={styles.card}>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>프로젝트 핵심 영역</h3>
            <p>
              로스터·캐릭터·메인룸 등 기존 기능을 그대로 유지합니다. Arena와 원래 시스템을 동시에
              비교하거나, 필요에 따라 언제든지 돌아갈 수 있습니다.
            </p>
          </div>
          <div className={styles.grid}>
            {projectSections.map((section) => (
              <Link key={section.href} href={section.href} className={styles.card}>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </Link>
            ))}
          </div>
        </section>
      </ArcadeLayout>
    </>
  )
}
