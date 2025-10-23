import { useEffect, useMemo, useState } from 'react';

import useHeroProfile from '../useHeroProfile';
import { buildAbilityCards } from '../../../utils/characterStats';

export function useCharacterProfileSection({ heroId, onRequireAuth, onMissingHero, onDeleted }) {
  const profile = useHeroProfile({
    heroId,
    onRequireAuth,
    onMissingHero,
    onDeleted,
  });

  const abilityCards = useMemo(() => buildAbilityCards(profile.edit), [profile.edit]);
  const heroName = useMemo(
    () => profile.edit?.name || profile.hero?.name || '이름 없는 캐릭터',
    [profile.edit?.name, profile.hero?.name]
  );

  const [audioPreviewUrl, setAudioPreviewUrl] = useState('');

  useEffect(() => {
    if (!profile.bgmBlob) {
      setAudioPreviewUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(profile.bgmBlob);
    setAudioPreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [profile.bgmBlob]);

  const audioSource = audioPreviewUrl || profile.edit?.bgm_url || profile.hero?.bgm_url || '';

  return {
    status: {
      loading: profile.loading,
      saving: profile.saving,
    },
    hero: profile.hero,
    heroName,
    edit: profile.edit,
    abilityCards,
    background: {
      preview: profile.backgroundPreview,
      inputRef: profile.backgroundInputRef,
      error: profile.backgroundError,
    },
    bgm: {
      blob: profile.bgmBlob,
      label: profile.bgmLabel,
      duration: profile.bgmDuration,
      mime: profile.bgmMime,
      error: profile.bgmError,
      inputRef: profile.bgmInputRef,
    },
    audio: {
      source: audioSource,
      duration: profile.bgmDuration,
    },
    actions: {
      changeEdit: profile.onChangeEdit,
      addAbility: profile.onAddAbility,
      reverseAbilities: profile.onReverseAbilities,
      clearAbility: profile.onClearAbility,
      backgroundUpload: profile.onBackgroundUpload,
      backgroundClear: profile.onClearBackground,
      bgmUpload: profile.onBgmUpload,
      bgmClear: profile.onClearBgm,
      save: profile.onSave,
      remove: profile.onDelete,
    },
    saving: profile.saving,
    reload: profile.reload,
  };
}
