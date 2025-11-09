'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { resolveViewerProfile } from '../../lib/heroes/resolveViewerProfile';
import { supabase } from '../../lib/supabase';
import { EMPTY_REQUESTS, loadFriendSnapshot } from '../../lib/social/friends';

function normaliseViewerHint(hint) {
  if (!hint) return null;
  const heroId = hint.heroId || hint.hero_id || hint.id || null;
  const ownerId = hint.ownerId || hint.owner_id || hint.userId || hint.user_id || null;
  const name = hint.heroName || hint.name || hint.displayName || null;
  const avatar = hint.avatarUrl ?? hint.avatar_url ?? hint.image_url ?? null;
  const userId = hint.userId || hint.user_id || ownerId || null;

  if (!heroId && !ownerId && !userId && !name && !avatar) {
    return null;
  }

  return {
    name: name || '익명',
    avatar_url: avatar ?? null,
    hero_id: heroId || null,
    owner_id: ownerId || userId || null,
    user_id: userId || ownerId || null,
  };
}

function mergeViewerProfile(base, hint) {
  if (!hint) return base;
  const merged = { ...base };
  if (hint.hero_id && hint.hero_id !== merged.hero_id) {
    merged.hero_id = hint.hero_id;
  }
  if (hint.owner_id && hint.owner_id !== merged.owner_id) {
    merged.owner_id = hint.owner_id;
  }
  if (hint.avatar_url && hint.avatar_url !== merged.avatar_url) {
    merged.avatar_url = hint.avatar_url;
  }
  if (hint.name && (merged.name === '익명' || merged.name !== hint.name)) {
    merged.name = hint.name;
  }
  if (hint.user_id && hint.user_id !== merged.user_id) {
    merged.user_id = hint.user_id;
  }
  return merged;
}

export function useHeroSocialBootstrap(heroId, viewerHeroHint = null) {
  const hintProfile = useMemo(() => normaliseViewerHint(viewerHeroHint), [viewerHeroHint]);
  const [viewer, setViewer] = useState(hintProfile);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState(EMPTY_REQUESTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshSocial = useCallback(async () => {
    if (!viewer?.user_id) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }

    setLoading(true);
    setError('');
    try {
      const snapshot = await loadFriendSnapshot(viewer.user_id);
      setFriends(snapshot.friends);
      setFriendRequests(snapshot.requests);
      setLoading(false);
      return { ok: true };
    } catch (refreshError) {
      console.error(refreshError);
      setFriends([]);
      setFriendRequests(EMPTY_REQUESTS);
      setLoading(false);
      const message = refreshError?.message || '친구 정보를 불러오지 못했습니다.';
      setError(message);
      return { ok: false, error: message };
    }
  }, [viewer?.user_id]);

  useEffect(() => {
    if (!hintProfile) return;
    setViewer(prev => mergeViewerProfile(prev || hintProfile, hintProfile));
  }, [hintProfile]);

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      setLoading(true);
      setError('');

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!alive) return;

      if (authError || !user) {
        setLoading(false);
        setError('로그인이 필요합니다.');
        return;
      }

      try {
        const profile = await resolveViewerProfile(user, heroId, {
          fallbackHero: viewerHeroHint,
        });
        if (!alive) return;

        const viewerProfile = mergeViewerProfile({ ...profile, user_id: user.id }, hintProfile);
        setViewer(viewerProfile);

        try {
          const snapshot = await loadFriendSnapshot(user.id);
          if (!alive) return;

          setFriends(snapshot.friends);
          setFriendRequests(snapshot.requests);
        } catch (socialError) {
          console.error(socialError);
          if (!alive) return;

          setFriends([]);
          setFriendRequests(EMPTY_REQUESTS);
          setError('친구 정보를 불러오지 못했습니다.');
        }
      } catch (profileError) {
        console.error(profileError);
        if (!alive) return;

        setError('프로필 정보를 불러오지 못했습니다.');
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      alive = false;
    };
  }, [heroId, hintProfile, viewerHeroHint]);

  return {
    viewer,
    friends,
    friendRequests,
    loading,
    error,
    setFriends,
    setFriendRequests,
    setError,
    refreshSocial,
  };
}
