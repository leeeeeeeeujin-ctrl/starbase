import React, { useEffect, useMemo, useState } from 'react'

import { useCharacterDashboardContext } from '../context'
import HeroDetailsForm from './editHero/HeroDetailsForm'
import HeroBackgroundSection from './editHero/HeroBackgroundSection'
import HeroBgmSection from './editHero/HeroBgmSection'
import HeroAbilitiesSection from './editHero/HeroAbilitiesSection'
import { modalStyles } from './editHero/styles'

const TABS = [
  { id: 'details', label: '기본 정보', description: '이름과 소개를 손봐 플레이어에게 보일 내용을 정리하세요.' },
  { id: 'background', label: '배경', description: '배경 이미지를 올려 캐릭터 페이지 분위기를 맞출 수 있어요.' },
  { id: 'bgm', label: 'BGM', description: '배경 음악을 등록해 진입 시 재생될 사운드를 지정하세요.' },
  { id: 'abilities', label: '능력', description: '스킬 설명과 순서를 손봐 플레이 스타일을 드러내 보세요.' },
]

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

  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    setActiveTab(TABS[0].id)

    const updateCompact = () => {
      if (typeof window === 'undefined') return
      setIsCompact(window.innerWidth <= 860)
    }

    updateCompact()
    window.addEventListener('resize', updateCompact)
    return () => window.removeEventListener('resize', updateCompact)
  }, [open])

  if (!open) return null

  const backgroundSource = backgroundPreview || edit.background_url || hero?.background_url

  const bodyStyle = useMemo(() => {
    if (!isCompact) return modalStyles.body
    return { ...modalStyles.body, gridTemplateColumns: '1fr' }
  }, [isCompact])

  const tabsStyle = isCompact ? modalStyles.compactTabs : modalStyles.tabs
  const panelViewportStyle = isCompact
    ? { ...modalStyles.panelViewport, ...modalStyles.compactPanelViewport }
    : modalStyles.panelViewport

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'background':
        return (
          <HeroBackgroundSection
            backgroundSource={backgroundSource}
            onUpload={onBackgroundUpload}
            onClear={onClearBackground}
            inputRef={backgroundInputRef}
            error={backgroundError}
          />
        )
      case 'bgm':
        return (
          <HeroBgmSection
            label={bgmLabel}
            duration={bgmDuration}
            fallbackUrl={edit.bgm_url}
            onUpload={onBgmUpload}
            onClear={onClearBgm}
            inputRef={bgmInputRef}
            error={bgmError}
          />
        )
      case 'abilities':
        return (
          <HeroAbilitiesSection
            abilityCards={abilityCards}
            onChangeEdit={onChangeEdit}
            onAddAbility={onAddAbility}
            onReverseAbilities={onReverseAbilities}
            onClearAbility={onClearAbility}
          />
        )
      case 'details':
      default:
        return <HeroDetailsForm name={edit.name} description={edit.description} onChange={onChangeEdit} />
    }
  }, [
    activeTab,
    abilityCards,
    bgmDuration,
    bgmError,
    bgmInputRef,
    bgmLabel,
    edit.bgm_url,
    edit.description,
    edit.name,
    backgroundError,
    backgroundInputRef,
    backgroundSource,
    onAddAbility,
    onClearBackground,
    onBackgroundUpload,
    onClearBgm,
    onBgmUpload,
    onChangeEdit,
    onClearAbility,
    onReverseAbilities,
  ])

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        <header style={modalStyles.header}>
          <h2 style={modalStyles.title}>프로필 편집</h2>
          <button type="button" onClick={onClose} style={modalStyles.closeButton}>
            닫기
          </button>
        </header>
        <div style={bodyStyle}>
          <div style={tabsStyle}>
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              const baseStyle = {
                ...modalStyles.tabButton,
                ...(isCompact ? modalStyles.compactTabButton : null),
                ...(isActive ? modalStyles.activeTabButton : null),
              }
              return (
                <button
                  key={tab.id}
                  type="button"
                  style={baseStyle}
                  onClick={() => setActiveTab(tab.id)}
                  aria-selected={isActive}
                >
                  <span>{tab.label}</span>
                  <span style={modalStyles.tabDescription}>{tab.description}</span>
                </button>
              )
            })}
          </div>
          <div style={panelViewportStyle}>
            <div style={modalStyles.panelContent}>{tabContent}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
