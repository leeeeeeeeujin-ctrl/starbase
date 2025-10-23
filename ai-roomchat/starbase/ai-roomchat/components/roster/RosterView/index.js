'use client'

import { useMemo, useState } from 'react'

import LogoutButton from '../../LogoutButton'
import HeroList from './HeroList'
import styles from './styles'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function summariseBody(body) {
  if (typeof body !== 'string') return ''
  const firstLine = body.split('\n').map((line) => line.trim()).find(Boolean)
  if (!firstLine) return ''
  if (firstLine.length <= 120) return firstLine
  return `${firstLine.slice(0, 117)}…`
}

function extractParagraphs(body) {
  if (typeof body !== 'string') return []
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function RosterView({
  loading,
  error,
  heroes,
  displayName,
  avatarUrl,
  onSelectHero,
  onCreateHero,
  onRetry,
  onLogout,
  announcements = [],
  announcementsLoading = false,
  onRefreshAnnouncements,
}) {
  const [showAllNotices, setShowAllNotices] = useState(false)

  const latestAnnouncement = useMemo(
    () => (Array.isArray(announcements) && announcements.length > 0 ? announcements[0] : null),
    [announcements],
  )

  const latestSummary = summariseBody(latestAnnouncement?.body)
  const latestDate = latestAnnouncement ? formatDate(latestAnnouncement.publishedAt) : null

  const refreshButtonStyle = announcementsLoading
    ? { ...styles.noticeRefresh, ...styles.noticeButtonDisabled }
    : styles.noticeRefresh
  const toggleDisabled = !latestAnnouncement && !announcementsLoading
  const toggleButtonStyle = toggleDisabled
    ? { ...styles.noticeToggle, ...styles.noticeButtonDisabled }
    : styles.noticeToggle

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <header style={styles.header}>
          <div style={styles.topBar}>
            <div style={styles.brandGroup}>
              <div style={styles.brandMark}>Starbase of Solaris</div>
              <p style={styles.brandTagline}>캐릭터 자랑, 실감나는 논쟁까지 환영</p>
            </div>
            <div style={styles.profileAction}>
              <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogout} />
            </div>
          </div>

          <section style={styles.noticeCard}>
            <div style={styles.noticeHeader}>
              <span style={styles.noticeBadge}>공지</span>
              <div style={styles.noticeActions}>
                <button
                  type="button"
                  style={refreshButtonStyle}
                  onClick={onRefreshAnnouncements}
                  disabled={announcementsLoading}
                >
                  새로 고침
                </button>
                <button
                  type="button"
                  style={toggleButtonStyle}
                  onClick={() => setShowAllNotices((value) => !value)}
                  disabled={toggleDisabled}
                >
                  {showAllNotices ? '접기' : '전체 보기'}
                </button>
              </div>
            </div>

            {announcementsLoading ? (
              <p style={styles.noticeCopy}>공지 정보를 불러오는 중입니다…</p>
            ) : latestAnnouncement ? (
              <div style={styles.noticeBody}>
                <h2 style={styles.noticeHeading}>{latestAnnouncement.title}</h2>
                {latestDate && <time style={styles.noticeTimestamp}>{latestDate} 게시</time>}
                {latestSummary && <p style={styles.noticeSummary}>{latestSummary}</p>}
              </div>
            ) : (
              <p style={styles.noticeCopy}>등록된 공지가 없습니다. 관리자 패널에서 새 공지를 작성해 주세요.</p>
            )}

            {showAllNotices && !announcementsLoading && announcements.length > 0 && (
              <ul style={styles.noticeList}>
                {announcements.map((item) => {
                  const paragraphs = extractParagraphs(item.body)
                  const date = formatDate(item.publishedAt)
                  return (
                    <li key={item.id} style={styles.noticeListItem}>
                      <div style={styles.noticeListHeader}>
                        <p style={styles.noticeListTitle}>{item.title}</p>
                        {date && <time style={styles.noticeListTimestamp}>{date}</time>}
                      </div>
                      {paragraphs.map((paragraph, index) => (
                        <p
                           
                          key={index}
                          style={
                            index === paragraphs.length - 1
                              ? { ...styles.noticeListParagraph, marginBottom: 0 }
                              : styles.noticeListParagraph
                          }
                        >
                          {paragraph}
                        </p>
                      ))}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section style={styles.calloutCard}>
            <h1 style={styles.calloutTitle}>영웅을 생성하고 전설을 시작하세요</h1>
            <p style={styles.calloutSubtitle}>아래에서 내 영웅을 선택하면 캐릭터 화면으로 이동합니다.</p>
          </section>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroHeader}>
            <h2 style={styles.heroTitle}>내 영웅 목록</h2>
            <span style={styles.heroCount}>{heroes.length}명</span>
          </div>
          <HeroList
            loading={loading}
            error={error}
            heroes={heroes}
            onSelectHero={onSelectHero}
            onCreateHero={onCreateHero}
            onRetry={onRetry}
          />
        </section>
      </div>
    </div>
  )
}
