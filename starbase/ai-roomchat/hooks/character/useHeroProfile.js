import { useEffect } from 'react'
import { useRouter } from 'next/router'

import { useHeroEditState } from './profile/useHeroEditState'
import { useHeroBackgroundManager } from './profile/useHeroBackgroundManager'
import { useHeroBgmManager } from './profile/useHeroBgmManager'
import { useHeroPersistence } from './profile/useHeroPersistence'

export default function useHeroProfile({ heroId, onRequireAuth, onMissingHero, onDeleted }) {
  const router = useRouter()
  const {
    loading,
    hero,
    edit,
    setHero,
    setEdit,
    loadHero,
    onChangeEdit,
    onAddAbility,
    onReverseAbilities,
    onClearAbility,
  } = useHeroEditState({ heroId, onRequireAuth, onMissingHero })

  const {
    backgroundInputRef,
    backgroundBlob,
    backgroundPreview,
    backgroundError,
    onBackgroundUpload,
    onClearBackground,
    onHeroChange: syncBackgroundFromHero,
    onSaveComplete: completeBackgroundSave,
  } = useHeroBackgroundManager({ setEdit })

  const {
    bgmInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmMime,
    bgmError,
    onBgmUpload,
    onClearBgm,
    onHeroChange: syncBgmFromHero,
    onSaveComplete: completeBgmSave,
  } = useHeroBgmManager({ setEdit })

  useEffect(() => {
    syncBackgroundFromHero(hero)
    syncBgmFromHero(hero)
  }, [hero, syncBackgroundFromHero, syncBgmFromHero])

  const { saving, onSave, onDelete } = useHeroPersistence({
    heroId,
    hero,
    edit,
    setHero,
    setEdit,
    background: {
      backgroundBlob,
      onSaveComplete: completeBackgroundSave,
    },
    bgm: {
      bgmBlob,
      bgmDuration,
      bgmMime,
      onSaveComplete: completeBgmSave,
    },
    onDeleted,
    router,
  })

  return {
    loading,
    saving,
    hero,
    edit,
    backgroundInputRef,
    backgroundPreview,
    backgroundError,
    bgmInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmMime,
    bgmError,
    onChangeEdit,
    onAddAbility,
    onReverseAbilities,
    onClearAbility,
    onBackgroundUpload,
    onClearBackground,
    onBgmUpload,
    onClearBgm,
    onSave,
    onDelete,
    reload: loadHero,
  }
}
