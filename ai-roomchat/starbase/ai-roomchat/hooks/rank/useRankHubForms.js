import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseHeroIdCsv } from '../../lib/rank/forms';

const DEFAULT_NAME = '테스트 게임';
const DEFAULT_DESC = 'MVP 테스트용';

const DEFAULT_ROLES = [
  { name: '공격', slot_count: 2 },
  { name: '수비', slot_count: 1 },
  { name: '서포트', slot_count: 1 },
];

function createDefaultRoles() {
  return DEFAULT_ROLES.map(role => ({ ...role }));
}

export function useRankHubForms({ games }) {
  const [gName, setGName] = useState(DEFAULT_NAME);
  const [gDesc, setGDesc] = useState(DEFAULT_DESC);
  const [gImage, setGImage] = useState('');
  const [gPromptSetId, setGPromptSetId] = useState('');
  const [roles, setRoles] = useState(() => createDefaultRoles());

  const totalSlots = useMemo(
    () => roles.reduce((sum, role) => sum + (Number(role.slot_count) || 0), 0),
    [roles]
  );

  const [selGameId, setSelGameId] = useState('');
  const [heroIdsCSV, setHeroIdsCSV] = useState('');
  const heroIds = useMemo(() => parseHeroIdCsv(heroIdsCSV), [heroIdsCSV]);

  const [playGameId, setPlayGameId] = useState('');
  const [playHeroIdsCSV, setPlayHeroIdsCSV] = useState('');
  const [userApiKey, setUserApiKey] = useState('');
  const [playResult, setPlayResult] = useState('');
  const playHeroIds = useMemo(() => parseHeroIdCsv(playHeroIdsCSV), [playHeroIdsCSV]);

  useEffect(() => {
    const firstGameId = games?.[0]?.id;
    if (firstGameId) {
      setSelGameId(prev => prev || firstGameId);
      setPlayGameId(prev => prev || firstGameId);
    } else {
      setSelGameId('');
      setPlayGameId('');
    }
  }, [games]);

  const resetCreateForm = useCallback(() => {
    setGName(DEFAULT_NAME);
    setGDesc(DEFAULT_DESC);
    setGImage('');
    setGPromptSetId('');
    setRoles(createDefaultRoles());
  }, []);

  const createForm = useMemo(
    () => ({
      gName,
      setGName,
      gDesc,
      setGDesc,
      gImage,
      setGImage,
      gPromptSetId,
      setGPromptSetId,
      roles,
      setRoles,
      totalSlots,
      reset: resetCreateForm,
    }),
    [gName, gDesc, gImage, gPromptSetId, roles, totalSlots, resetCreateForm]
  );

  const joinForm = useMemo(
    () => ({
      selGameId,
      setSelGameId,
      heroIdsCSV,
      setHeroIdsCSV,
      heroIds,
    }),
    [heroIds, heroIdsCSV, selGameId]
  );

  const playForm = useMemo(
    () => ({
      playGameId,
      setPlayGameId,
      playHeroIdsCSV,
      setPlayHeroIdsCSV,
      playHeroIds,
      userApiKey,
      setUserApiKey,
      playResult,
      setPlayResult,
    }),
    [playGameId, playHeroIds, playHeroIdsCSV, playResult, userApiKey]
  );

  return {
    createForm,
    joinForm,
    playForm,
  };
}
