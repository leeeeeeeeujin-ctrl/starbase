'use client';

import { useMemo } from 'react';

import { useFriendActions } from './useFriendActions';
import { useHeroSocialBootstrap } from './useHeroSocialBootstrap';

export function useHeroSocial({ heroId, heroName, page, viewerHero = null }) {
  const { viewer, friends, friendRequests, loading, error, refreshSocial } = useHeroSocialBootstrap(
    heroId,
    viewerHero
  );

  const friendActions = useFriendActions(viewer, refreshSocial);

  const friendByOwner = useMemo(() => {
    const map = new Map();
    for (const friend of friends) {
      if (friend.friendOwnerId) {
        map.set(friend.friendOwnerId, friend);
      }
    }
    return map;
  }, [friends]);

  const friendByHero = useMemo(() => {
    const map = new Map();
    for (const friend of friends) {
      if (friend.friendHeroId) {
        map.set(friend.friendHeroId, friend);
      }
      if (friend.currentHeroId) {
        map.set(friend.currentHeroId, friend);
      }
    }
    return map;
  }, [friends]);

  return {
    viewer,
    friends,
    friendRequests,
    loading,
    error,
    ...friendActions,
    friendByOwner,
    friendByHero,
    refreshSocial,
  };
}
