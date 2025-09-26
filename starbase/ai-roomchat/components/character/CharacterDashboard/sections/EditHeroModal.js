import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useCharacterDashboardContext } from '../context'
import HeroDetailsForm from './editHero/HeroDetailsForm'
import HeroBackgroundSection from './editHero/HeroBackgroundSection'
import HeroBgmSection from './editHero/HeroBgmSection'
import HeroAbilitiesSection from './editHero/HeroAbilitiesSection'
import { modalStyles } from './editHero/styles'
import { ABILITY_KEYS, buildAbilityCards } from '../../../../utils/characterStats'

const TABS = [
  { id: 'details', label: '기본 정보', description: '이름과 소개를 손봐 플레이어에게 보일 내용을 정리하세요.' },
  { id: 'background', label: '배경', description: '배경 이미지를 올려 캐릭터 페이지 분위기를 맞출 수 있어요.' },
  { id: 'bgm', label: 'BGM', description: '배경 음악을 등록해 진입 시 재생될 사운드를 지정하세요.' },
  { id: 'abilities', label: '능력', description: '스킬 설명과 순서를 손봐 플레이 스타일을 드러내 보세요.' },
]

const EMPTY_DRAFT = {
  name: '',
  description: '',
  ability1: '',
  ability2: '',
  ability3: '',
  ability4: '',
  background_url: '',
  bgm_url: '',
}

function createDraftFromProfile(hero, edit) {
  return {
    name: hero?.name || edit?.name || '',
    description: hero?.description || edit?.description || '',
    ability1: hero?.ability1 || edit?.ability1 || '',
    ability2: hero?.ability2 || edit?.ability2 || '',
    ability3: hero?.ability3 || edit?.ability3 || '',
    ability4: hero?.ability4 || edit?.ability4 || '',
    background_url: hero?.background_url || edit?.background_url || '',
    bgm_url: hero?.bgm_url || edit?.bgm_url || '',
  }
}

export default function EditHeroModal({ open, onClose }) {
  const {
    hero,
    edit,
    saving,
    onSave,
    onDelete,
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
  } = useCharacterDashboardContext()

  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [isCompact, setIsCompact] = useState(false)
  const [draft, setDraft] = useState(null)
  const [localSaving, setLocalSaving] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setDraft(null)
      initializedRef.current = false
      return
    }

    setActiveTab(TABS[0].id)

    const updateCompact = () => {
      if (typeof window === 'undefined') return
      setIsCompact(window.innerWidth <= 860)
    }

    updateCompact()
    window.addEventListener('resize', updateCompact)

    return () => {
      window.removeEventListener('resize', updateCompact)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (initializedRef.current) return

    const initialDraft = createDraftFromProfile(hero, edit)
    setDraft(initialDraft)
    initializedRef.current = true
  }, [open, hero, edit])

  useEffect(() => {
    if (!open || !draft) return
    if (edit?.background_url === '' && draft.background_url !== '') {
      setDraft((prev) => (prev ? { ...prev, background_url: '' } : prev))
    }
  }, [open, draft, edit?.background_url])

  useEffect(() => {
    if (!open || !draft) return
    const currentHeroBackground = hero?.background_url || ''
    if (currentHeroBackground && draft.background_url !== currentHeroBackground) {
      setDraft((prev) => (prev ? { ...prev, background_url: currentHeroBackground } : prev))
    }
  }, [open, draft, hero?.background_url])

  useEffect(() => {
    if (!open || !draft) return
    if (edit?.bgm_url === '' && draft.bgm_url !== '') {
      setDraft((prev) => (prev ? { ...prev, bgm_url: '' } : prev))
    }
  }, [open, draft, edit?.bgm_url])

  useEffect(() => {
    if (!open || !draft) return
    const currentHeroBgm = hero?.bgm_url || ''
    if (currentHeroBgm && draft.bgm_url !== currentHeroBgm) {
      setDraft((prev) => (prev ? { ...prev, bgm_url: currentHeroBgm } : prev))
    }
  }, [open, draft, hero?.bgm_url])

  const draftState = useMemo(() => {
    if (draft) return draft
    const snapshot = createDraftFromProfile(hero, edit)
    return snapshot || EMPTY_DRAFT
  }, [draft, hero, edit])

  const abilityCards = useMemo(() => buildAbilityCards(draftState), [draftState])
  const heroBackgroundUrl = hero?.background_url || ''
  const backgroundSource = backgroundPreview || draftState.background_url || heroBackgroundUrl

  const bodyStyle = useMemo(() => {
    if (!isCompact) return modalStyles.body
    return { ...modalStyles.body, gridTemplateColumns: '1fr' }
  }, [isCompact])

  const tabsStyle = isCompact ? modalStyles.compactTabs : modalStyles.tabs
  const panelViewportStyle = isCompact
    ? { ...modalStyles.panelViewport, ...modalStyles.compactPanelViewport }
    : modalStyles.panelViewport

  const handleChangeField = useCallback((key, value) => {
    setDraft((prev) => ({ ...(prev || draftState), [key]: value }))
  }, [draftState])

  const handleAddAbility = useCallback(() => {
    let added = false
    setDraft((prev) => {
      const base = prev || draftState
      const next = { ...base }
      for (const key of ABILITY_KEYS) {
        if (!(next[key] && next[key].trim())) {
          next[key] = next[key] || ''
          added = true
          break
        }
      }
      return next
    })
    if (!added) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
    }
  }, [draftState])

  const handleReverseAbilities = useCallback(() => {
    setDraft((prev) => {
      const base = prev || draftState
      const next = { ...base }
      const values = ABILITY_KEYS.map((key) => next[key] || '')
      values.reverse()
      ABILITY_KEYS.forEach((key, index) => {
        next[key] = values[index]
      })
      return next
    })
  }, [draftState])

  const handleClearAbility = useCallback((key) => {
    setDraft((prev) => ({ ...(prev || draftState), [key]: '' }))
  }, [draftState])

  const handleSave = useCallback(async () => {
    if (!draftState || saving || localSaving) return
    setLocalSaving(true)
    try {
      await onSave(draftState)
      setDraft(null)
      initializedRef.current = false
      onClose?.()
    } finally {
      setLocalSaving(false)
    }
  }, [draftState, onSave, onClose, saving, localSaving])

  const handleClose = useCallback(() => {
    setDraft(null)
    initializedRef.current = false
    onClose?.()
  }, [onClose])

  const abilityTabContent = (
    <HeroAbilitiesSection
      abilityCards={abilityCards}
      onChangeEdit={handleChangeField}
      onAddAbility={handleAddAbility}
      onReverseAbilities={handleReverseAbilities}
      onClearAbility={handleClearAbility}
    />
  )

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
            fallbackUrl={draftState.bgm_url}
            onUpload={onBgmUpload}
            onClear={onClearBgm}
            inputRef={bgmInputRef}
            error={bgmError}
          />
        )
      case 'abilities':
        return abilityTabContent
      case 'details':
      default:
        return (
          <HeroDetailsForm
            name={draftState.name}
            description={draftState.description}
            onChange={handleChangeField}
          />
        )
    }
  }, [
    activeTab,
    abilityTabContent,
    backgroundSource,
    bgmDuration,
    bgmError,
    bgmInputRef,
    bgmLabel,
    draftState.bgm_url,
    draftState.description,
    draftState.name,
    onBackgroundUpload,
    onBgmUpload,
    onClearBackground,
    onClearBgm,
    backgroundInputRef,
    backgroundError,
    handleChangeField,
  ])

  const disabledSave = saving || localSaving

  if (!open) {
    return null
  }

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modal}>
        <header style={modalStyles.header}>
          <h2 style={modalStyles.title}>프로필 편집</h2>
          <button type="button" onClick={handleClose} style={modalStyles.closeButton}>
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
        <footer style={modalStyles.footer}>
          <button
            type="button"
            onClick={handleClose}
            style={modalStyles.secondaryAction}
            disabled={saving || localSaving}
          >
            취소
          </button>
          <div style={modalStyles.footerSpacer} />
          <button
            type="button"
            onClick={onDelete}
            style={modalStyles.dangerAction}
            disabled={saving || localSaving}
          >
            삭제
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              ...modalStyles.primaryAction,
              ...(disabledSave ? modalStyles.primaryActionDisabled : null),
            }}
            disabled={disabledSave}
          >
            {saving || localSaving ? '저장 중…' : '저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
