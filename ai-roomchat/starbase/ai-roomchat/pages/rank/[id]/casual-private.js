'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import CasualPrivateClient from '../../../components/rank/CasualPrivateClient';
import { useGameRoom } from '../../../hooks/useGameRoom';
import { loadActiveRoles } from '../../../lib/rank/matchmakingService';
import { MATCH_MODE_KEYS } from '../../../lib/rank/matchModes';
import { supabase } from '../../../lib/supabase';

export default function CasualPrivateRoomPage() {
  const router = useRouter();
  const { id } = router.query;
  const [mounted, setMounted] = useState(false);
  const [roleDetails, setRoleDetails] = useState([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRequireLogin = useCallback(() => {
    router.replace('/');
  }, [router]);

  const handleGameMissing = useCallback(() => {
    alert('게임을 찾을 수 없습니다.');
    router.replace('/rank');
  }, [router]);

  const handleDeleted = useCallback(() => {
    router.replace('/rank');
  }, [router]);

  const {
    state: { loading, game, roles, myHero, user },
    derived: { roleOccupancy },
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  });

  useEffect(() => {
    if (!mounted || !id) return;
    let cancelled = false;
    loadActiveRoles(supabase, id)
      .then(list => {
        if (!cancelled && Array.isArray(list)) {
          setRoleDetails(list);
        }
      })
      .catch(cause => {
        console.warn('역할 정보를 불러오지 못했습니다:', cause);
        if (!cancelled) setRoleDetails([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mounted]);

  const handleExit = useCallback(() => {
    if (!id) {
      router.replace('/rank');
      return;
    }
    router.replace(`/rank/${id}`);
  }, [id, router]);

  const handleLaunch = useCallback(() => {
    if (!id) return;
    router.push({ pathname: `/rank/${id}/start`, query: { mode: MATCH_MODE_KEYS.CASUAL_PRIVATE } });
  }, [id, router]);

  const ready = mounted && !loading;

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>사설 방 정보를 불러오는 중…</div>;
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>;
  }

  return (
    <CasualPrivateClient
      game={game}
      roleDetails={roleDetails}
      roles={roles}
      roleOccupancy={roleOccupancy}
      myHero={myHero}
      user={user}
      onExit={handleExit}
      onLaunch={handleLaunch}
    />
  );
}
