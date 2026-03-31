'use client';

import { useCallback, useMemo } from 'react';

import CharacterPlayPanel from '../CharacterPlayPanel';
import useHeroParticipations from '../../../hooks/character/useHeroParticipations';
import useHeroBattles from '../../../hooks/character/useHeroBattles';
import useParticipationCarousel from '../../../hooks/character/useParticipationCarousel';
import { formatPlayNumber, formatPlayWinRate } from '../../../utils/characterPlayFormatting';

export default function CharacterPlayScreen({ hero }) {
  const participationState = useHeroParticipations({ hero });
  const battleState = useHeroBattles({
    hero,
    selectedGameId: participationState.selectedGameId,
  });

  const {
    loading,
    error,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    heroLookup,
    setSelectedGameId,
    refresh,
  } = participationState;

  const {
    battleDetails,
    battleSummary,
    visibleBattles,
    loading: battleLoading,
    error: battleError,
    showMore,
  } = battleState;

  const carouselEntries = useMemo(() => participations || [], [participations]);
  const matchCount = selectedScoreboard?.length || 0;
  const heroRank = useMemo(() => {
    if (!hero?.id || !Array.isArray(selectedScoreboard)) return null;
    const index = selectedScoreboard.findIndex(row => row?.hero_id === hero.id || row?.heroId === hero.id);
    return index >= 0 ? index + 1 : null;
  }, [hero?.id, selectedScoreboard]);
  const heroScore = useMemo(() => {
    if (!hero?.id || !Array.isArray(selectedScoreboard)) return 0;
    const row = selectedScoreboard.find(item => item?.hero_id === hero.id || item?.heroId === hero.id);
    const raw = Number(row?.score ?? row?.rating ?? 0);
    return Number.isFinite(raw) ? raw : 0;
  }, [hero?.id, selectedScoreboard]);

  const { trackRef, registerItem, handleCardClick, handleIndicatorClick } = useParticipationCarousel({
    entries: carouselEntries,
    selectedGameId,
    onSelect: setSelectedGameId,
  });

  const playPanelData = useMemo(
    () => ({
      selectedEntry,
      selectedGame,
      selectedGameId,
      battleDetails,
      battleSummary,
      visibleBattles,
      battleLoading,
      battleError,
      showMoreBattles: showMore,
      refreshParticipations: refresh,
    }),
    [
      selectedEntry,
      selectedGame,
      selectedGameId,
      battleDetails,
      battleSummary,
      visibleBattles,
      battleLoading,
      battleError,
      showMore,
      refresh,
    ]
  );

  const handleRetry = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <section style={shellStyle} data-swipe-lock="true">
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 18 }}>참여한 게임</strong>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            선택한 게임을 기준으로 통계와 게임 시작 패널을 아래에서 바로 다룹니다.
          </span>
        </div>

        {loading ? (
          <div style={emptyStyle}>참여한 게임을 불러오는 중입니다…</div>
        ) : error ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={emptyStyle}>{error}</div>
            <button type="button" onClick={handleRetry} style={actionButtonStyle}>
              다시 불러오기
            </button>
          </div>
        ) : carouselEntries.length ? (
          <>
            <div ref={trackRef} style={carouselTrackStyle}>
              {carouselEntries.map(entry => {
                const active = entry.game_id === selectedGameId;
                const gameName = entry.game?.name || '이름 없는 게임';
                const roleLabel = entry.role || '역할 없음';
                return (
                  <button
                    key={entry.game_id}
                    ref={registerItem(entry.game_id)}
                    type="button"
                    onClick={() => handleCardClick(entry.game_id)}
                    style={{
                      ...carouselCardStyle,
                      ...(active ? carouselCardActiveStyle : null),
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 16, color: '#f8fafc', textAlign: 'left' }}>{gameName}</strong>
                      <span style={{ fontSize: 12, color: '#cbd5e1', textAlign: 'left' }}>{roleLabel}</span>
                      {active ? <span style={{ fontSize: 11, color: '#7dd3fc', fontWeight: 800, textAlign: 'left' }}>선택됨</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {carouselEntries.length > 1 ? (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {carouselEntries.map(entry => (
                  <button
                    key={`indicator-${entry.game_id}`}
                    type="button"
                    onClick={() => handleIndicatorClick(entry.game_id)}
                    style={{
                      width: entry.game_id === selectedGameId ? 28 : 10,
                      height: 10,
                      borderRadius: 999,
                      border: 'none',
                      background: entry.game_id === selectedGameId ? '#38bdf8' : 'rgba(148,163,184,0.4)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div style={emptyStyle}>아직 이 캐릭터가 참여한 게임이 없습니다.</div>
        )}
      </section>

      <section style={shellStyle}>
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 18 }}>선택한 게임 통계</strong>
          {selectedGame ? <span style={{ fontSize: 13, color: '#94a3b8' }}>{selectedGame.name}</span> : null}
        </div>
        <div style={statsGridStyle}>
          <StatCard label="랭킹" value={heroRank ? `#${heroRank}` : '—'} meta="참가자 대비 현재 순위" />
          <StatCard label="스코어" value={formatPlayNumber(heroScore)} meta="최근 기록된 전투 점수" />
          <StatCard label="승률" value={formatPlayWinRate(battleSummary)} meta="최근 40판 기준" />
          <StatCard label="전투 수" value={matchCount ? String(matchCount) : '—'} meta="집계된 총 전투 횟수" />
        </div>
      </section>

      <section style={shellStyle}>
        <CharacterPlayPanel hero={hero} playData={playPanelData} heroLookup={heroLookup} />
      </section>
    </>
  );
}

function StatCard({ label, value, meta }) {
  return (
    <div style={statCardStyle}>
      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{label}</span>
      <strong style={{ fontSize: 22, color: '#f8fafc' }}>{value}</strong>
      <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{meta}</span>
    </div>
  );
}

const shellStyle = {
  padding: 16,
  borderRadius: 24,
  background: 'rgba(2, 6, 23, 0.78)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  display: 'grid',
  gap: 14,
};

const carouselTrackStyle = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  paddingBottom: 4,
};

const carouselCardStyle = {
  flex: '0 0 min(260px, 72vw)',
  minWidth: 180,
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.72)',
  padding: '14px 16px',
  cursor: 'pointer',
};

const carouselCardActiveStyle = {
  borderColor: 'rgba(56,189,248,0.7)',
  boxShadow: '0 18px 44px -30px rgba(56,189,248,0.6)',
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
};

const statCardStyle = {
  padding: '14px 16px',
  borderRadius: 18,
  background: 'rgba(15,23,42,0.72)',
  border: '1px solid rgba(148,163,184,0.2)',
  display: 'grid',
  gap: 6,
};

const emptyStyle = {
  padding: '16px 14px',
  borderRadius: 16,
  border: '1px dashed rgba(148,163,184,0.35)',
  background: 'rgba(15,23,42,0.55)',
  textAlign: 'center',
  fontSize: 13,
  color: '#cbd5f5',
};

const actionButtonStyle = {
  justifySelf: 'center',
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.35)',
  background: 'rgba(15,23,42,0.72)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
};
