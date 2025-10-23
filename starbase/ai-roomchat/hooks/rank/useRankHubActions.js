import { useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { playRank, registerGame } from '../../lib/rank/api';
import { requireList, requireNonEmpty, requireUser } from '../../lib/rank/validation';

function serializeRoles(roles) {
  return roles.map(role => ({
    name: role.name || '역할',
    slot_count: Number(role.slot_count) || 1,
  }));
}

export function useRankHubActions({ user, refreshLists, createForm, joinForm, playForm }) {
  const onCreateGame = useCallback(async () => {
    if (!requireUser(user)) {
      return;
    }

    if (!requireNonEmpty(createForm.gPromptSetId, 'prompt_set_id를 입력하세요.')) {
      return;
    }

    const response = await registerGame({
      name: createForm.gName,
      description: createForm.gDesc,
      image_url: createForm.gImage,
      prompt_set_id: createForm.gPromptSetId,
      roles: serializeRoles(createForm.roles),
    });

    if (response.ok) {
      alert('게임 등록 완료');
      createForm.reset();
      await refreshLists();
    } else {
      alert('등록 실패: ' + (response.error || 'unknown'));
    }
  }, [createForm, refreshLists, user]);

  const onJoin = useCallback(async () => {
    if (!requireUser(user)) {
      return;
    }

    if (!requireNonEmpty(joinForm.selGameId, '게임을 선택하세요.')) {
      return;
    }

    if (!requireList(joinForm.heroIds, '히어로 ID들을 입력하세요.')) {
      return;
    }

    const { error } = await supabase.from('rank_participants').upsert(
      {
        game_id: joinForm.selGameId,
        owner_id: user.id,
        hero_ids: joinForm.heroIds,
      },
      { onConflict: 'game_id,owner_id' }
    );

    if (error) {
      alert(error.message);
      return;
    }

    alert('참가/팩 저장 완료');
    await refreshLists(joinForm.selGameId);
  }, [joinForm.heroIds, joinForm.selGameId, refreshLists, user]);

  const onPlay = useCallback(async () => {
    if (!requireUser(user)) {
      return;
    }

    if (!requireNonEmpty(playForm.playGameId, '게임 선택')) {
      return;
    }

    if (!requireList(playForm.playHeroIds, '히어로 ID들을 입력')) {
      return;
    }

    if (!requireNonEmpty(playForm.userApiKey, 'OpenAI API 키를 입력')) {
      return;
    }

    playForm.setPlayResult('요청 중…');
    const result = await playRank({
      gameId: playForm.playGameId,
      heroIds: playForm.playHeroIds,
      userApiKey: playForm.userApiKey,
    });

    playForm.setPlayResult(JSON.stringify(result, null, 2));

    if (result.ok) {
      await refreshLists(playForm.playGameId);
    }
  }, [playForm, refreshLists, user]);

  return {
    onCreateGame,
    onJoin,
    onPlay,
  };
}
