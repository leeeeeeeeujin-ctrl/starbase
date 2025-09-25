import React, { useEffect, useMemo, useState } from 'react'

import BackgroundLayer from './sections/BackgroundLayer'
import LeftColumn from './sections/LeftColumn'
import RightColumn from './sections/RightColumn'
import FooterBar from './sections/FooterBar'
import EditHeroModal from './sections/EditHeroModal'

export default function CharacterDashboard(props) {
  const {
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
    participations,
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
    onStartBattle,
    onBack,
    onGoLobby,
  } = props

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

  return (
    <div style={styles.root}>
      <BackgroundLayer
        backgroundUrl={backgroundPreview || hero?.background_url}
      />
      <div style={styles.inner}>
        <div style={styles.grid}>
          <LeftColumn
            hero={hero}
            heroName={heroName}
            onOpenEdit={() => setShowEditPanel(true)}
            saving={saving}
            onSave={onSave}
            onDelete={onDelete}
            audioSource={audioSource}
            bgmDuration={bgmDuration}
            statPages={statPages}
            statPageIndex={statPageIndex}
            onChangeStatPage={setStatPageIndex}
            hasParticipations={hasParticipations}
            visibleStatSlides={visibleStatSlides}
            selectedGameId={selectedGameId}
            onSelectGame={onSelectGame}
            selectedEntry={selectedEntry}
          />
          <RightColumn
            selectedGameId={selectedGameId}
            selectedEntry={selectedEntry}
            battleSummary={battleSummary}
            onStartBattle={onStartBattle}
            scoreboardRows={scoreboardRows}
            heroId={hero?.id}
            heroLookup={heroLookup}
            battleDetails={battleDetails}
            visibleBattles={visibleBattles}
            onShowMoreBattles={onShowMoreBattles}
            battleLoading={battleLoading}
            battleError={battleError}
          />
        </div>
      </div>
      <FooterBar onBack={onBack} onGoLobby={onGoLobby} />
      <EditHeroModal
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        hero={hero}
        edit={edit}
        onChangeEdit={onChangeEdit}
        backgroundPreview={backgroundPreview}
        onBackgroundUpload={onBackgroundUpload}
        onClearBackground={onClearBackground}
        backgroundInputRef={backgroundInputRef}
        backgroundError={backgroundError}
        bgmLabel={bgmLabel}
        bgmDuration={bgmDuration}
        onBgmUpload={onBgmUpload}
        onClearBgm={onClearBgm}
        bgmInputRef={bgmInputRef}
        bgmError={bgmError}
        abilityCards={abilityCards}
        onAddAbility={onAddAbility}
        onReverseAbilities={onReverseAbilities}
        onClearAbility={onClearAbility}
      />
    </div>
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
