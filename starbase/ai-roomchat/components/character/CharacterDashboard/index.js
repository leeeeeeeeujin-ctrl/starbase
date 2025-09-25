import React, { useEffect, useMemo, useState } from 'react'

import BackgroundLayer from './sections/BackgroundLayer'
import LeftColumn from './sections/LeftColumn'
import RightColumn from './sections/RightColumn'
import FooterBar from './sections/FooterBar'
import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider } from './context'

export default function CharacterDashboard({
  dashboard,
  heroName,
  onStartBattle,
  onBack,
  onGoLobby,
}) {
  const {
    hero,
    edit,
    onChangeEdit,
    saving,
    onSave,
    onDelete,
    backgroundPreview,
    backgroundError,
    onBackgroundUpload,
    onClearBackground,
    backgroundInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmError,
    onBgmUpload,
    onClearBgm,
    bgmInputRef,
    abilityCards,
    onAddAbility,
    onReverseAbilities,
    onClearAbility,
    statSlides,
    selectedGameId,
    onSelectGame,
    selectedGame,
    selectedEntry,
    selectedScoreboard,
    heroLookup,
    battleSummary,
    battleDetails,
    visibleBattles,
    onShowMoreBattles,
    battleLoading,
    battleError,
  } = dashboard

  const [statPageIndex, setStatPageIndex] = useState(0)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('')

  useEffect(() => {
    if (!bgmBlob) {
      setAudioPreviewUrl('')
      return
    }
    const nextUrl = URL.createObjectURL(bgmBlob)
    setAudioPreviewUrl(nextUrl)
    return () => {
      URL.revokeObjectURL(nextUrl)
    }
  }, [bgmBlob])

  const statPages = useMemo(() => {
    if (!statSlides?.length) return []
    const chunked = []
    for (let index = 0; index < statSlides.length; index += 6) {
      chunked.push(statSlides.slice(index, index + 6))
    }
    return chunked
  }, [statSlides])

  useEffect(() => {
    if (!statPages.length) {
      if (statPageIndex !== 0) setStatPageIndex(0)
      return
    }
    if (statPageIndex >= statPages.length) {
      setStatPageIndex(statPages.length - 1)
    }
  }, [statPageIndex, statPages])

  useEffect(() => {
    if (!statSlides?.length) return
    if (!selectedGameId) {
      onSelectGame(statSlides[0].key)
      return
    }
    const targetIndex = statPages.findIndex((page) =>
      page.some((slide) => slide.key === selectedGameId)
    )
    if (targetIndex >= 0 && targetIndex !== statPageIndex) {
      setStatPageIndex(targetIndex)
    }
  }, [statSlides, statPages, selectedGameId, statPageIndex, onSelectGame])

  const visibleStatSlides = statPages.length
    ? statPages[Math.min(statPageIndex, statPages.length - 1)]
    : statSlides

  const audioSource = audioPreviewUrl || edit.bgm_url || ''
  const hasParticipations = Boolean(statSlides?.length)
  const scoreboardRows = selectedScoreboard || []

  const contextValue = {
    ...dashboard,
    hero,
    heroName,
    edit,
    onChangeEdit,
    saving,
    onSave,
    onDelete,
    backgroundPreview,
    backgroundError,
    onBackgroundUpload,
    onClearBackground,
    backgroundInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmError,
    onBgmUpload,
    onClearBgm,
    bgmInputRef,
    abilityCards,
    onAddAbility,
    onReverseAbilities,
    onClearAbility,
    statSlides,
    selectedGameId,
    onSelectGame,
    selectedGame,
    selectedEntry,
    selectedScoreboard,
    heroLookup,
    battleSummary,
    battleDetails,
    visibleBattles,
    onShowMoreBattles,
    battleLoading,
    battleError,
    audioSource,
    hasParticipations,
    statPages,
    statPageIndex,
    setStatPageIndex,
    visibleStatSlides,
    scoreboardRows,
    openEditPanel: () => setShowEditPanel(true),
    closeEditPanel: () => setShowEditPanel(false),
    onStartBattle,
  }

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.root}>
        <BackgroundLayer
          backgroundUrl={backgroundPreview || hero?.background_url}
        />
        <div style={styles.inner}>
          <div style={styles.grid}>
            <LeftColumn />
            <RightColumn />
          </div>
        </div>
        <FooterBar onBack={onBack} onGoLobby={onGoLobby} />
        <EditHeroModal
          open={showEditPanel}
          onClose={() => setShowEditPanel(false)}
        />
      </div>
    </CharacterDashboardProvider>
  )
}

const styles = {
  root: {
    position: 'relative',
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    fontFamily: '"Noto Sans CJK KR", sans-serif',
  },
  inner: {
    position: 'relative',
    zIndex: 1,
    padding: '32px 24px 120px',
    maxWidth: 1320,
    margin: '0 auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 380px) 1fr',
    gap: 28,
    alignItems: 'start',
  },
}

//
