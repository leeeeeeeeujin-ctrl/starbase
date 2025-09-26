import React from 'react'

import { useCharacterDashboardContext } from '../context'
import HeroDetailsForm from './editHero/HeroDetailsForm'
import HeroBackgroundSection from './editHero/HeroBackgroundSection'
import HeroBgmSection from './editHero/HeroBgmSection'
import HeroAbilitiesSection from './editHero/HeroAbilitiesSection'
import { modalStyles } from './editHero/styles'

export default function EditHeroModal({ open, onClose }) {
  const {
    hero,
    edit,
    onChangeEdit,
    backgroundPreview,
    onBackgroundUpload,
    onClearBackground,
    backgroundInputRef,
    backgroundError,
    bgmLabel,
    bgmDuration,
    onBgmUpload,
    onClearBgm,
    bgmInputRef,
    bgmError,
    abilityCards,
    onAddAbility,
    onReverseAbilities,
    onClearAbility,
  } = useCharacterDashboardContext()

  if (!open) return null

  const backgroundSource = backgroundPreview || edit.background_url || hero?.background_url

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        <header style={modalStyles.header}>
          <h2 style={modalStyles.title}>프로필 편집</h2>
          <button type="button" onClick={onClose} style={modalStyles.closeButton}>
            닫기
          </button>
        </header>
        <div style={modalStyles.grid}>
          <HeroDetailsForm name={edit.name} description={edit.description} onChange={onChangeEdit} />
          <HeroBackgroundSection
            backgroundSource={backgroundSource}
            onUpload={onBackgroundUpload}
            onClear={onClearBackground}
            inputRef={backgroundInputRef}
            error={backgroundError}
          />
          <HeroBgmSection
            label={bgmLabel}
            duration={bgmDuration}
            fallbackUrl={edit.bgm_url}
            onUpload={onBgmUpload}
            onClear={onClearBgm}
            inputRef={bgmInputRef}
            error={bgmError}
          />
          <HeroAbilitiesSection
            abilityCards={abilityCards}
            onChangeEdit={onChangeEdit}
            onAddAbility={onAddAbility}
            onReverseAbilities={onReverseAbilities}
            onClearAbility={onClearAbility}
          />
        </div>
      </div>
    </div>
  )
}
