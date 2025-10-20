import { GameSection } from './GameSection'
import { HighlightCard } from './HighlightCard'
import { LeaderRow } from './LeaderRow'
import { useRankingShowcaseData } from './useRankingShowcaseData'
import { baseCardStyle } from './utils'

export default function RankingShowcase({
  onInvite,
  onWhisper,
  onRequestProfile,
  maxGameSections = 3,
}) {
  const { loading, error, highlight, leaders, perGameSections, topStats } = useRankingShowcaseData({
    maxGameSections,
  })

  if (loading) {
    return (
      <div style={baseCardStyle}>
        <strong>랭킹 정보를 불러오는 중…</strong>
        <span style={{ fontSize: 13, opacity: 0.7 }}>잠시만 기다려 주세요.</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...baseCardStyle, color: '#fecaca' }}>
        <strong>랭킹 정보를 불러오는 중 오류가 발생했습니다.</strong>
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{error}</span>
      </div>
    )
  }

  if (!highlight) {
    return (
      <div style={baseCardStyle}>아직 집계된 랭킹이 없습니다. 게임을 플레이해 순위를 만들어 보세요.</div>
    )
  }

  const highlightStats = highlight
    ? { ...(topStats || {}), rating: Math.round(highlight.rating ?? highlight.score ?? 0) }
    : null

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <HighlightCard
        hero={highlight.hero || null}
        stats={highlightStats}
        onInvite={onInvite}
        onWhisper={onWhisper}
        onProfile={onRequestProfile}
        gameId={highlight.game_id}
        heroId={highlight.heroId}
      />

      <section style={baseCardStyle}>
        <header>
          <h3 style={{ margin: 0 }}>전체 랭킹 TOP 6</h3>
        </header>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {leaders.map((entry, index) => (
            <LeaderRow
              key={entry.id || `${entry.heroId}-${index}`}
              entry={entry}
              rank={index + 1}
              onWhisper={onWhisper}
              onProfile={onRequestProfile}
            />
          ))}
        </ul>
      </section>

      {perGameSections.length ? (
        <section style={baseCardStyle}>
          <h3 style={{ margin: 0 }}>게임별 상위권</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
            {perGameSections.map((section) => (
              <GameSection
                key={section.gameId}
                section={section}
                onInvite={onInvite}
                onWhisper={onWhisper}
                onProfile={onRequestProfile}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

//
