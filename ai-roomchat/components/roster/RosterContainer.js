'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/router';

import { useRoster } from '../../hooks/roster/useRoster';
import RosterView from './RosterView';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import { persistHeroSelection } from '../../lib/heroes/selectedHeroStorage';

export default function RosterContainer() {
  const router = useRouter();

  const handleUnauthorized = useCallback(() => {
    router.replace('/');
  }, [router]);

  const { loading, error, heroes, displayName, avatarUrl, resetError, reload } = useRoster({
    onUnauthorized: handleUnauthorized,
  });

  const handleSelectHero = useCallback(
    hero => {
      if (!hero?.id) return;

      try {
        persistHeroSelection(hero);
      } catch (storageError) {
        console.error('Failed to persist selected hero before navigation:', storageError);
      }

      router.push(`/character/${hero.id}`);
    },
    [router]
  );

  const handleCreateHero = useCallback(() => {
    router.push('/create');
  }, [router]);

  const handleRetry = useCallback(() => {
    resetError();
    reload();
  }, [reload, resetError]);

  const handleLogoutComplete = useCallback(() => {
    router.replace('/');
  }, [router]);

  const {
    items: announcements,
    loading: announcementsLoading,
    reload: reloadAnnouncements,
  } = useAnnouncements({ limit: 8 });

  return (
    <RosterView
      loading={loading}
      error={error}
      heroes={heroes}
      displayName={displayName}
      avatarUrl={avatarUrl}
      onSelectHero={handleSelectHero}
      onCreateHero={handleCreateHero}
      onRetry={handleRetry}
      onLogout={handleLogoutComplete}
      announcements={announcements}
      announcementsLoading={announcementsLoading}
      onRefreshAnnouncements={reloadAnnouncements}
    />
  );
}
