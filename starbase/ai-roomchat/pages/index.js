import Link from 'next/link'
import Head from 'next/head'
import { ArcadeLayout } from '@/components/arena/ArcadeLayout'
import styles from '@/styles/ArcadeHome.module.css'

const coreFlowSections = [
  {
    title: '1. 타이틀',
    body: 'Rank Hub(메인룸)에서 시즌 소개와 바로가기 위젯을 확인하고 오늘의 플레이 계획을 세웁니다.',
    href: '/play',
  },
  {
    title: '2. 로스터',
    body: '참가자 슬롯과 영웅 구성을 정리해 두면 이후 모든 페이지에서 동일 데이터를 공유할 수 있습니다.',
    href: '/roster',
  },
  {
    title: '3. 캐릭터 & 로비',
    body: '로비에서 선택한 영웅 대시보드와 이벤트를 통해 매칭 전 준비 상태를 점검합니다.',
    href: '/lobby',
  },
]

const arenaSections = [
  {
    title: '큐 합류',
    body: '대기열 RPC로 자리 예약 후 실시간으로 배정과 상태 변화를 확인합니다.',
    href: '/arena/queue',
  },
  {
    title: '준비 투표',
    body: '15초 카운트다운 동안 모두가 준비 완료를 확정하면 자동으로 본게임을 개시합니다.',
    href: '/arena/staging',
  },
  {
    title: '본게임 & 로그',
    body: '세션 턴 로그·가시성 옵션·AI 응답 기록을 한 화면에서 모니터링합니다.',
    href: '/arena/sessions/demo-session',
  },
  {
    title: '정산 패널',
    body: '전투 종료 후 점수와 보상을 검증하고 후속 자동화를 점검합니다.',
    href: '/arena/sessions/demo-session/score',
  },
  {
    title: '운영 도구',
    body: '큐 리셋과 publication 검사 등 운영 도구를 실행합니다.',
    href: '/arena/control',
  },
]

const supportingSections = [
  {
    title: '메이커',
    body: '프롬프트와 이벤트 번들을 조합해 새 게임을 준비합니다.',
    href: '/maker',
  },
  {
    title: '레거시 방 목록',
    body: '이전 방 UI 흐름을 확인하거나 비교 테스트가 필요할 때 참고합니다.',
    href: '/rooms',
  },
  {
    title: '도구 모음',
    body: '운영과 디버깅을 위한 추가 도구는 Tools/Private 섹션에서 계속 접근 가능합니다.',
    href: '/tools',
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
          <h2>타이틀 → 로스터 → 캐릭터 흐름을 유지한 채 Arena를 병행</h2>
          <p>
            기존 입장 동선은 타이틀 화면에서 로스터로, 그리고 캐릭터·로비로 이어집니다. Arena는 방
            검색을 대체해 세션을 더 빨리 꾸리는 도구이며, 필요할 때만 들를 수 있도록 분리해 두었습니다.
          </p>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>기본 진입 흐름</h3>
            <p>타이틀 허브에서 시작해 로스터와 캐릭터를 정비한 뒤 매칭을 진행하세요.</p>
          </div>
          <div className={styles.grid}>
            {coreFlowSections.map((section) => (
              <Link key={section.href} href={section.href} className={styles.card}>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Arena 매칭 (옵션)</h3>
            <p>
              방 검색 단계는 Arena 흐름으로 대체했습니다. 세션 주도형 매칭이 필요할 때 아래 순서를
              따르세요.
            </p>
            <p className={styles.inlineNote}>
              * Arena는 방 정비 없이도 RPC + Realtime 조합으로 큐 → 준비 → 본게임을 연결합니다.
            </p>
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
            <h3>부가 기능과 운영 도구</h3>
            <p>제작, 레거시 방 비교, 추가 운영 툴은 여기에서 확인할 수 있습니다.</p>
          </div>
          <div className={styles.grid}>
            {supportingSections.map((section) => (
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
