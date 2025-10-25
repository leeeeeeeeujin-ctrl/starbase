import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import LobbyLayout from '../components/lobby/LobbyLayout';
import LobbyHeader from '../components/lobby/LobbyHeader';
import TabBar from '../components/lobby/TabBar';
import GameSearchPanel from '../components/lobby/GameSearchPanel';
import MyGamesPanel from '../components/lobby/MyGamesPanel';
import CharacterStatsPanel from '../components/lobby/CharacterStatsPanel';
import useGameBrowser from '../components/lobby/hooks/useGameBrowser';
import { LOBBY_TABS, NAV_LINKS } from '../components/lobby/constants';
import useLobbyStats from '../components/lobby/hooks/useLobbyStats';
import { readHeroSelection } from '../lib/heroes/selectedHeroStorage';

export default function Lobby() {
  const router = useRouter();
  const { heroId: heroIdParam } = router.query;
  const [activeTab, setActiveTab] = useState('games');
  const [storedHeroId, setStoredHeroId] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');

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
      const target = role ? `${game.id}?role=${encodeURIComponent(role)}` : game.id;
      router.push(`/rank/${target}`);
    },
    [router]
  );

  return (
    <LobbyLayout
      header={<LobbyHeader onBack={handleBack} navLinks={NAV_LINKS} />}
      tabs={<TabBar tabs={LOBBY_TABS} activeTab={activeTab} onChange={setActiveTab} />}
      backgroundUrl={backgroundUrl}
    >
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
  );
}
//
