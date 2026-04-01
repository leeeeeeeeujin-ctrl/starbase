import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import LobbyLayout from '../components/lobby/LobbyLayout';
import LobbyHeader from '../components/lobby/LobbyHeader';
import TabBar from '../components/lobby/TabBar';
import GameSearchPanel from '../components/lobby/GameSearchPanel';
import MyGamesPanel from '../components/lobby/MyGamesPanel';
import CharacterStatsPanel from '../components/lobby/CharacterStatsPanel';
import CharacterRouteHud from '../components/character/routes/CharacterRouteHud';
import useGameBrowser from '../components/lobby/hooks/useGameBrowser';
import { LOBBY_TABS, NAV_LINKS } from '../components/lobby/constants';
import useLobbyStats from '../components/lobby/hooks/useLobbyStats';
import { fetchHeroRecordById, readHeroSelection } from '../lib/heroes/selectedHeroStorage';

export default function Lobby() {
  const router = useRouter();
  const { heroId: heroIdParam } = router.query;
  const [activeTab, setActiveTab] = useState('games');
  const [storedHeroId, setStoredHeroId] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [selectedHero, setSelectedHero] = useState(null);
  const [showDesktopNav, setShowDesktopNav] = useState(false);
  const startRef = useRef(null);

  const heroId = useMemo(() => {
    if (Array.isArray(heroIdParam)) return heroIdParam[0] || '';
    return heroIdParam || '';
  }, [heroIdParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const selection = readHeroSelection();
    setStoredHeroId(selection?.heroId || '');
    try {
      const savedBackground = window.localStorage.getItem('selectedHeroBackgroundUrl') || '';
      setBackgroundUrl(savedBackground);
    } catch (error) {
      console.error('로비 배경 정보를 불러오지 못했습니다:', error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const targetHeroId = heroId || storedHeroId;
    if (!targetHeroId) {
      setSelectedHero(null);
      return;
    }
    fetchHeroRecordById(targetHeroId, {
      columns: 'id,name,image_url,background_url,bgm_url,bgm_duration_seconds,owner_id',
    }).then(hero => {
      if (cancelled) return;
      setSelectedHero(hero || null);
    });
    return () => {
      cancelled = true;
    };
  }, [heroId, storedHeroId]);

  const returnHeroId = heroId || storedHeroId;

  const gameBrowser = useGameBrowser({ enabled: activeTab === 'games', mode: 'public' });
  const myGamesBrowser = useGameBrowser({ enabled: activeTab === 'my-games', mode: 'owned' });
  const stats = useLobbyStats({ heroId, enabled: activeTab === 'stats' });
  useEffect(() => {
    const { tab } = router.query || {};
    if (typeof tab === 'string') {
      if (tab === 'games' || tab === 'my-games' || tab === 'stats') {
        setActiveTab(tab);
      }
    }
  }, [router.query?.tab]);

  const handleBack = useCallback(() => {
    if (returnHeroId) {
      router.replace(`/character/${returnHeroId}`);
    } else {
      router.replace('/roster');
    }
  }, [returnHeroId, router]);

  const handleEnterGame = useCallback(
    (game, role) => {
      if (!game) return;
      if (returnHeroId) {
        const params = new URLSearchParams();
        params.set('gameId', String(game.id));
        if (role) {
          params.set('role', String(role));
        }
        router.push(`/character/${returnHeroId}/play?${params.toString()}`);
        return;
      }
      router.push('/roster');
    },
    [returnHeroId, router]
  );

  const handleTouchStart = useCallback(
    event => {
      if (event.target?.closest?.('[data-swipe-lock="true"]')) {
        startRef.current = null;
        return;
      }
      const touch = event.touches?.[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
    },
    []
  );

  const handleTouchEnd = useCallback(
    event => {
      if (!startRef.current || !returnHeroId) return;
      const touch = event.changedTouches?.[0];
      if (!touch) {
        startRef.current = null;
        return;
      }
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      startRef.current = null;
      if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) {
        router.push(`/character/${returnHeroId}`);
      }
    },
    [returnHeroId, router]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateDesktopNav = () => {
      setShowDesktopNav(window.innerWidth >= 980);
    };
    updateDesktopNav();
    window.addEventListener('resize', updateDesktopNav);
    return () => {
      window.removeEventListener('resize', updateDesktopNav);
    };
  }, []);

  return (
    <>
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <LobbyLayout
          header={<LobbyHeader onBack={handleBack} navLinks={NAV_LINKS} />}
          tabs={<TabBar tabs={LOBBY_TABS} activeTab={activeTab} onChange={setActiveTab} />}
          backgroundUrl={backgroundUrl}
        >
          {showDesktopNav && returnHeroId ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <button type="button" onClick={() => router.push(`/character/${returnHeroId}`)} style={desktopNavButtonStyle}>
                캐릭터
              </button>
              <button type="button" onClick={() => router.push(`/character/${returnHeroId}/agent`)} style={desktopNavButtonStyle}>
                캐릭터 AI
              </button>
              <button type="button" onClick={() => router.push(`/character/${returnHeroId}/play`)} style={desktopNavButtonStyle}>
                게임 시작
              </button>
            </div>
          ) : null}
          {activeTab === 'games' && (
            <GameSearchPanel
              query={gameBrowser.gameQuery}
              onQueryChange={gameBrowser.setGameQuery}
              sort={gameBrowser.gameSort}
              onSortChange={gameBrowser.setGameSort}
              sortOptions={gameBrowser.sortOptions}
              rows={gameBrowser.gameRows}
              loading={gameBrowser.gameLoading}
              selectedGame={gameBrowser.selectedGame}
              onSelectGame={gameBrowser.setSelectedGame}
              detailLoading={gameBrowser.detailLoading}
              roles={gameBrowser.gameRoles}
              participants={gameBrowser.participants}
              roleChoice={gameBrowser.roleChoice}
              onRoleChange={gameBrowser.setRoleChoice}
              roleSlots={gameBrowser.roleSlots}
              onEnterGame={handleEnterGame}
              viewerParticipant={gameBrowser.viewerParticipant}
              viewerId={gameBrowser.viewerId}
              onJoinGame={gameBrowser.joinSelectedGame}
              joinLoading={gameBrowser.joinLoading}
            />
          )}

          {activeTab === 'my-games' && (
            <MyGamesPanel
              query={myGamesBrowser.gameQuery}
              onQueryChange={myGamesBrowser.setGameQuery}
              sort={myGamesBrowser.gameSort}
              onSortChange={myGamesBrowser.setGameSort}
              sortOptions={myGamesBrowser.sortOptions}
              rows={myGamesBrowser.gameRows}
              loading={myGamesBrowser.gameLoading}
              selectedGame={myGamesBrowser.selectedGame}
              onSelectGame={myGamesBrowser.setSelectedGame}
              detailLoading={myGamesBrowser.detailLoading}
              roles={myGamesBrowser.gameRoles}
              participants={myGamesBrowser.participants}
              roleChoice={myGamesBrowser.roleChoice}
              onRoleChange={myGamesBrowser.setRoleChoice}
              roleSlots={myGamesBrowser.roleSlots}
              onEnterGame={handleEnterGame}
              viewerId={myGamesBrowser.viewerId}
              tags={myGamesBrowser.gameTags}
              onAddTag={myGamesBrowser.addGameTag}
              onRemoveTag={myGamesBrowser.removeGameTag}
              seasons={myGamesBrowser.gameSeasons}
              onFinishSeason={myGamesBrowser.finishSeason}
              onStartSeason={myGamesBrowser.startSeason}
              stats={myGamesBrowser.gameStats}
              battleLogs={myGamesBrowser.gameBattleLogs}
              onRefreshDetail={myGamesBrowser.refreshSelectedGame}
              onDeleteGame={myGamesBrowser.deleteGame}
            />
          )}

          {activeTab === 'stats' && (
            <CharacterStatsPanel
              loading={stats.loading}
              error={stats.error}
              summary={stats.summary}
              games={stats.games}
              seasons={stats.seasons}
              battles={stats.battles}
              onLeaveGame={stats.leaveGame}
              onRefresh={stats.refresh}
            />
          )}
        </LobbyLayout>
      </div>
      <CharacterRouteHud hero={selectedHero} />
    </>
  );
}

const desktopNavButtonStyle = {
  appearance: 'none',
  border: '1px solid rgba(148, 163, 184, 0.28)',
  borderRadius: 999,
  padding: '10px 16px',
  background: 'rgba(2, 6, 23, 0.68)',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 18px 44px -30px rgba(15,23,42,0.72)',
  backdropFilter: 'blur(10px)',
};
//
