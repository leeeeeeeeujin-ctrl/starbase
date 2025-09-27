'use client'

import { useMemo } from 'react'

import styles from './styles'

const COMMUNITY_URL = 'https://gall.dcinside.com/mini/board/lists/?id=gionkirr'

const STATIC_USER = {
  name: '게스트 플레이어',
  status: '오늘도 새로운 전설을 써보세요!',
}

const STATIC_HEROES = [
  {
    id: 'static-hero-1',
    name: '튜이',
    imageUrl:
      'https://jvopmawzszamguydylwu.supabase.co/storage/v1/object/public/heroes/heroes/1758926329522-asset.jpg',
    createdAt: '2025-09-26T22:38:52.94973+00:00',
  },
  {
    id: 'static-hero-2',
    name: '유이',
    imageUrl:
      'https://jvopmawzszamguydylwu.supabase.co/storage/v1/object/public/heroes/heroes/1758926222422-asset.jpg',
    createdAt: '2025-09-26T22:37:05.821298+00:00',
  },
  {
    id: 'static-hero-3',
    name: '33',
    imageUrl:
      'https://jvopmawzszamguydylwu.supabase.co/storage/v1/object/public/heroes/heroes/1758773774430-33.jpg',
    createdAt: '2025-09-25T04:16:15.800453+00:00',
  },
]

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function ProfileBadge({ name, status }) {
  const initial = useMemo(() => {
    if (!name) return '게'
    const trimmed = name.trim()
    return trimmed ? trimmed[0] : '게'
  }, [name])

  return (
    <div style={styles.profileBadge}>
      <div style={styles.profileAvatar}>{initial}</div>
      <div style={styles.profileTextGroup}>
        <strong style={styles.profileName}>{name}</strong>
        <span style={styles.profileStatus}>{status}</span>
      </div>
    </div>
  )
}

function HeroCard({ hero }) {
  const name = hero?.name ? hero.name.trim() || '이름 없는 영웅' : '이름 없는 영웅'
  return (
    <button type="button" style={styles.heroCardButton}>
      <div style={styles.heroCardCover}>
        {hero?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.imageUrl} alt={name} style={styles.heroImage} />
        ) : (
          <div style={styles.heroImageFallback}>{name.slice(0, 2)}</div>
        )}
        <div style={styles.heroCardFooter}>
          <div style={styles.heroName}>{name}</div>
          <span style={styles.heroCreatedAt}>{formatDate(hero?.createdAt)}</span>
        </div>
      </div>
    </button>
  )
}

function CreateHeroCard() {
  return (
    <button type="button" style={styles.createCardButton}>
      <div style={styles.createCardCover}>
        <div style={styles.createCardOverlay} />
        <div style={styles.createCardIconWrapper}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
          </svg>
        </div>
        <div style={styles.createCardTextGroup}>
          <span style={styles.createCardTitle}>영웅 생성</span>
          <span style={styles.createCardSubtitle}>준비 중인 기능입니다</span>
        </div>
      </div>
    </button>
  )
}

export default function RosterContainer() {
  const heroes = STATIC_HEROES

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerTopRow}>
            <div style={styles.titleGroup}>
              <div style={styles.badge}>Tale of Heroes</div>
              <h1 style={styles.title}>나의 영웅 도감</h1>
              <p style={styles.subtitle}>영웅들을 관리하고 로비에서 곧바로 자랑해 보세요.</p>
            </div>
            <ProfileBadge name={STATIC_USER.name} status={STATIC_USER.status} />
          </div>

          <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" style={styles.communityCard}>
            <span style={styles.communityLabel}>공식 커뮤니티 오픈!</span>
            <p style={styles.communityDescription}>
              캐릭터 자랑, 설정 공유, 팬아트까지 모두 환영합니다. 지금 바로 커뮤니티에서 첫 인사를 남겨보세요.
            </p>
          </a>

          <div style={styles.heroCallout}>
            <div style={styles.heroCalloutOverlay} />
            <div style={styles.heroCalloutContent}>
              <span style={styles.heroCalloutEyebrow}>영웅을 생성하고</span>
              <h2 style={styles.heroCalloutTitle}>전설을 시작하세요</h2>
              <p style={styles.heroCalloutSubtitle}>
                새로운 영웅을 만들고 스토리를 기록하면 플레이어들이 당신의 세계를 함께 즐기게 됩니다.
              </p>
            </div>
          </div>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroSectionHeader}>
            <h2 style={styles.heroSectionTitle}>내 영웅 목록</h2>
            <span style={styles.heroSectionCount}>{heroes.length}명</span>
          </div>
          <div style={styles.heroListContainer}>
            {heroes.map((hero) => (
              <HeroCard key={hero.id} hero={hero} />
            ))}
            <CreateHeroCard />
          </div>
        </section>
      </div>
    </div>
  )
}
