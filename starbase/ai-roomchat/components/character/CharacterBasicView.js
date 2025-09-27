'use client'

import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { deleteHeroById, updateHeroById } from '../../services/heroes'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const dockItems = [
  { key: 'search', label: '방 검색', type: 'overlay' },
  { key: 'ranking', label: '랭킹', type: 'overlay' },
  { key: 'settings', label: '설정', type: 'overlay' },
  { key: 'battle', label: '전투 시작', type: 'action' },
  { key: 'roster', label: '로스터', type: 'overlay' },
]

const eqPresets = [
  { key: 'flat', label: '플랫' },
  { key: 'bass', label: '저음 강화' },
  { key: 'clarity', label: '명료도 향상' },
]

const overlayCopy = {
  character: '이미지를 터치하면 설명과 능력이 순서대로 나타납니다.',
  search: '빠른 매칭과 커스텀 방 탐색 기능이 곧 추가됩니다.',
  ranking: '시즌별 팀 랭킹과 개인 순위를 준비 중이에요.',
  roster: '전투 준비 중인 동료들을 한눈에 확인할 수 있도록 로스터 구성을 준비하고 있어요.',
}

const COOKIE_PREFIX = 'starbase_character_'
const BGM_ENABLED_COOKIE = `${COOKIE_PREFIX}bgm_enabled`
const BGM_VOLUME_COOKIE = `${COOKIE_PREFIX}bgm_volume`
const EQ_PRESET_COOKIE = `${COOKIE_PREFIX}eq_preset`
const EFFECTS_COOKIE = `${COOKIE_PREFIX}sfx_enabled`

function readCookie(name) {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie ? document.cookie.split('; ') : []
  for (let i = 0; i < cookies.length; i += 1) {
    const [cookieName, ...rest] = cookies[i].split('=')
    if (cookieName === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

function writeCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
}

function createDraftFromHero(hero) {
  return {
    name: hero?.name || '',
    description: hero?.description || '',
    ability1: hero?.ability1 || '',
    ability2: hero?.ability2 || '',
    ability3: hero?.ability3 || '',
    ability4: hero?.ability4 || '',
    image_url: hero?.image_url || '',
    background_url: hero?.background_url || '',
    bgm_url: hero?.bgm_url || '',
  }
}

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 120px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 120px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const styles = {
  stage: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 48,
  },
  heroSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '160%',
    borderRadius: 36,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
    cursor: 'pointer',
    outline: 'none',
  },
  heroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 0.3s ease',
  },
  heroFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 72,
    fontWeight: 800,
    background: 'linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.92) 100%)',
  },
  heroNameOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    padding: '30px 32px 36px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  heroInfoOverlay: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '12%',
    padding: '18px 22px',
    borderRadius: 28,
    background: 'rgba(15,23,42,0.78)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'none',
    boxShadow: '0 24px 60px -42px rgba(15,23,42,0.88)',
  },
  heroInfoTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#e0f2fe',
    letterSpacing: 0.2,
  },
  heroInfoText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.8,
    color: 'rgba(226,232,240,0.94)',
    whiteSpace: 'pre-line',
  },
  cornerIcon: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 14,
    background: 'rgba(15,23,42,0.58)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: 3,
    padding: 6,
    boxShadow: '0 14px 30px -22px rgba(15,23,42,0.8)',
  },
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'rgba(226,232,240,0.78)',
  },
  overlayPanel: {
    position: 'fixed',
    left: '50%',
    bottom: 28,
    transform: 'translateX(-50%)',
    width: 'min(92vw, 720px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'rgba(15,23,42,0.72)',
    borderRadius: 26,
    padding: '20px 22px',
    boxShadow: '0 24px 60px -40px rgba(15,23,42,0.9)',
    border: '1px solid rgba(96,165,250,0.35)',
  },
  overlayButtonsRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  overlayButton: (active) => ({
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: active ? 'rgba(125,211,252,0.9)' : 'rgba(148,163,184,0.4)',
    background: active ? 'rgba(56,189,248,0.22)' : 'rgba(15,23,42,0.42)',
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
  }),
  overlayActionButton: {
    padding: '10px 22px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.95) 0%, rgba(14,165,233,0.92) 100%)',
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    cursor: 'pointer',
    boxShadow: '0 18px 42px -26px rgba(14,165,233,0.8)',
    outline: 'none',
  },
  overlayCopy: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(226,232,240,0.9)',
  },
  settingsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  settingsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 18,
    background: 'rgba(15,23,42,0.55)',
    border: '1px solid rgba(94, 234, 212, 0.15)',
  },
  settingsHeading: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: '#a5f3fc',
    letterSpacing: 0.4,
  },
  settingsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  slider: {
    width: '100%',
  },
  toggleButton: (enabled) => ({
    alignSelf: 'flex-start',
    padding: 0,
    width: 54,
    height: 30,
    borderRadius: 999,
    border: enabled ? '1px solid rgba(125,211,252,0.85)' : '1px solid rgba(148,163,184,0.35)',
    background: enabled ? 'linear-gradient(135deg, rgba(45,212,191,0.88) 0%, rgba(56,189,248,0.82) 100%)' : 'rgba(15,23,42,0.65)',
    position: 'relative',
    cursor: 'pointer',
    outline: 'none',
  }),
  toggleKnob: (enabled) => ({
    position: 'absolute',
    top: 3,
    left: enabled ? 28 : 3,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: enabled ? '#0f172a' : '#e2e8f0',
    transition: 'left 0.18s ease',
  }),
  settingsLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(226,232,240,0.9)',
    margin: 0,
  },
  settingsHelper: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'rgba(148,163,184,0.92)',
    margin: 0,
  },
  settingsButtonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  settingsButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
  },
  dangerButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,0.55)',
    background: 'rgba(127,29,29,0.45)',
    color: '#fecaca',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
  },
  editForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  editField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(226,232,240,0.9)',
  },
  editInput: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.65)',
    color: '#f8fafc',
    fontSize: 13,
  },
  editTextarea: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.65)',
    color: '#f8fafc',
    fontSize: 13,
    minHeight: 88,
  },
  formActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryFormButton: {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(56,189,248,0.88) 100%)',
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
  },
  secondaryFormButton: {
    padding: '10px 18px',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    outline: 'none',
  },
  statusText: (variant) => ({
    fontSize: 12,
    color: variant === 'error' ? '#fca5a5' : '#bbf7d0',
    margin: 0,
  }),
}

export default function CharacterBasicView({ hero }) {
  const router = useRouter()
  const [currentHero, setCurrentHero] = useState(hero ?? null)
  const [bgmEnabled, setBgmEnabled] = useState(true)
  const [volume, setVolume] = useState(0.75)
  const [eqPreset, setEqPreset] = useState('flat')
  const [effectsEnabled, setEffectsEnabled] = useState(true)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editDraft, setEditDraft] = useState(() => createDraftFromHero(hero))
  const [savingHero, setSavingHero] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)

  useEffect(() => {
    setCurrentHero(hero ?? null)
    setEditDraft(createDraftFromHero(hero))
  }, [hero])

  useEffect(() => {
    const storedEnabled = readCookie(BGM_ENABLED_COOKIE)
    if (storedEnabled != null) {
      setBgmEnabled(storedEnabled !== '0')
    }

    const storedVolume = readCookie(BGM_VOLUME_COOKIE)
    if (storedVolume != null) {
      const parsed = Number.parseFloat(storedVolume)
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(Math.max(parsed, 0), 1)
        setVolume(clamped)
      }
    }

    const storedPreset = readCookie(EQ_PRESET_COOKIE)
    if (storedPreset) {
      setEqPreset(storedPreset)
    }

    const storedEffects = readCookie(EFFECTS_COOKIE)
    if (storedEffects != null) {
      setEffectsEnabled(storedEffects !== '0')
    }
  }, [])

  const heroName = useMemo(() => {
    if (!currentHero) return DEFAULT_HERO_NAME
    const trimmed = typeof currentHero.name === 'string' ? currentHero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [currentHero])

  const description = useMemo(() => {
    if (!currentHero) return DEFAULT_DESCRIPTION
    const text = typeof currentHero.description === 'string' ? currentHero.description.trim() : ''
    return text || DEFAULT_DESCRIPTION
  }, [currentHero])

  const abilityGroups = useMemo(() => {
    if (!currentHero) {
      return []
    }

    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(currentHero.ability1), normalize(currentHero.ability2)].filter(Boolean)
    const secondPair = [normalize(currentHero.ability3), normalize(currentHero.ability4)].filter(Boolean)

    const groups = []
    if (firstPair.length) {
      groups.push({ label: '능력 1 & 2', entries: firstPair })
    }
    if (secondPair.length) {
      groups.push({ label: '능력 3 & 4', entries: secondPair })
    }

    return groups
  }, [currentHero])

  const infoSequence = useMemo(() => {
    const sequence = []

    if (description) {
      sequence.push({ key: 'description', title: '설명', lines: [description] })
    }

    abilityGroups.forEach((group) => {
      sequence.push({ key: group.label, title: group.label, lines: group.entries })
    })

    return sequence
  }, [abilityGroups, description])

  const infoCount = infoSequence.length

  const currentEqPresetLabel = useMemo(() => {
    const found = eqPresets.find((preset) => preset.key === eqPreset)
    return found ? found.label : '플랫'
  }, [eqPreset])

  const [viewMode, setViewMode] = useState(0)
  const [activeOverlay, setActiveOverlay] = useState('character')

  useEffect(() => {
    setViewMode(0)
    setActiveOverlay('character')
  }, [currentHero?.id])

  useEffect(() => {
    if (activeOverlay !== 'settings') {
      setShowEditForm(false)
      setStatusMessage(null)
    }
  }, [activeOverlay])

  useEffect(() => {
    if (activeOverlay !== 'character') {
      setViewMode(0)
    }
  }, [activeOverlay])

  const audioRef = useRef(null)
  useEffect(() => {
    if (!currentHero?.bgm_url) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      return
    }

    const audio = new Audio(currentHero.bgm_url)
    audio.loop = true
    audio.volume = volume
    audioRef.current = audio

    const tryPlay = async () => {
      try {
        if (bgmEnabled) {
          await audio.play()
        }
      } catch (error) {
        console.warn('Failed to autoplay character BGM', error)
      }
    }

    tryPlay()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
  }, [currentHero?.bgm_url, bgmEnabled])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    if (!audioRef.current) return
    if (bgmEnabled) {
      audioRef.current
        .play()
        .catch((error) => console.warn('Failed to resume BGM playback', error))
    } else {
      audioRef.current.pause()
    }
  }, [bgmEnabled])

  const backgroundStyle = currentHero?.background_url
    ? pageStyles.withBackground(currentHero.background_url)
    : pageStyles.base

  const imageStyle = {
    ...styles.heroImage,
    filter: viewMode === 0 ? 'none' : 'brightness(0.72)',
  }

  const currentInfo = viewMode > 0 ? infoSequence[viewMode - 1] : null

  const handleTap = useCallback(() => {
    if (activeOverlay !== 'character') return
    if (infoCount === 0) return

    setViewMode((prev) => (prev + 1) % (infoCount + 1))
  }, [activeOverlay, infoCount])

  const handleKeyUp = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleTap()
      }
    },
    [handleTap],
  )

  const handleOverlayButton = useCallback((key) => {
    setActiveOverlay((prev) => (prev === key ? 'character' : key))
  }, [])

  const handleDockAction = useCallback((key) => {
    if (key === 'battle') {
      if (typeof window !== 'undefined') {
        window.alert('빠른 전투 매칭 시스템을 준비 중입니다!')
      }
    }
  }, [])

  const handleBgmToggle = useCallback(() => {
    setBgmEnabled((prev) => {
      const next = !prev
      writeCookie(BGM_ENABLED_COOKIE, next ? '1' : '0')
      return next
    })
  }, [])

  const handleVolumeChange = useCallback((event) => {
    const nextValue = Number.parseFloat(event.target.value)
    if (Number.isNaN(nextValue)) return
    const clamped = Math.min(Math.max(nextValue, 0), 1)
    setVolume(clamped)
    writeCookie(BGM_VOLUME_COOKIE, String(clamped))
  }, [])

  const handleEqSelect = useCallback((presetKey) => {
    setEqPreset(presetKey)
    writeCookie(EQ_PRESET_COOKIE, presetKey)
  }, [])

  const handleEffectsToggle = useCallback(() => {
    setEffectsEnabled((prev) => {
      const next = !prev
      writeCookie(EFFECTS_COOKIE, next ? '1' : '0')
      return next
    })
  }, [])

  const handleDraftChange = useCallback((field, value) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleResetDraft = useCallback(() => {
    setEditDraft(createDraftFromHero(currentHero))
    setStatusMessage(null)
  }, [currentHero])

  const handleSaveDraft = useCallback(async () => {
    if (!currentHero?.id) {
      setStatusMessage({ type: 'error', text: '영웅 정보를 불러오지 못했습니다.' })
      return
    }

    setSavingHero(true)
    setStatusMessage(null)
    try {
      const payload = { ...editDraft }
      const updatedHero = await updateHeroById(currentHero.id, payload)
      setCurrentHero(updatedHero)
      setEditDraft(createDraftFromHero(updatedHero))
      setStatusMessage({ type: 'success', text: '캐릭터 정보를 저장했습니다.' })
      router.replace(router.asPath)
    } catch (error) {
      console.error('Failed to update hero', error)
      setStatusMessage({ type: 'error', text: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
    } finally {
      setSavingHero(false)
    }
  }, [currentHero, editDraft, router])

  const handleDeleteHero = useCallback(async () => {
    if (!currentHero?.id) {
      setStatusMessage({ type: 'error', text: '삭제할 캐릭터가 없습니다.' })
      return
    }

    const firstConfirm = typeof window !== 'undefined' ? window.confirm('캐릭터를 삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?') : true
    if (!firstConfirm) return
    const secondConfirm = typeof window !== 'undefined' ? window.confirm('정말로 캐릭터를 삭제하시겠습니까?') : true
    if (!secondConfirm) return

    setSavingHero(true)
    setStatusMessage(null)
    try {
      await deleteHeroById(currentHero.id)
      setStatusMessage({ type: 'success', text: '캐릭터를 삭제했습니다.' })
      setCurrentHero(null)
      setEditDraft(createDraftFromHero(null))
      setShowEditForm(false)
      router.replace(router.asPath)
    } catch (error) {
      console.error('Failed to delete hero', error)
      setStatusMessage({ type: 'error', text: '삭제에 실패했습니다. 다시 시도해 주세요.' })
    } finally {
      setSavingHero(false)
    }
  }, [currentHero, router])

  const overlayDescription = overlayCopy[activeOverlay] ?? ''

  return (
    <>
      <div style={backgroundStyle}>
        <div style={styles.stage}>
          <div style={styles.heroSection}>
            <div style={styles.heroCardShell}>
              <div
                role="button"
                tabIndex={0}
                style={styles.heroCard}
                onClick={handleTap}
                onKeyUp={handleKeyUp}
                data-swipe-ignore="true"
              >
                <div style={styles.cornerIcon} aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span key={`dot-${index}`} style={styles.cornerDot} />
                  ))}
                </div>

                {currentHero?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentHero.image_url} alt={heroName} style={imageStyle} />
                ) : (
                  <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
                )}

                {viewMode === 0 ? (
                  <div style={styles.heroNameOverlay}>
                    <p style={styles.heroNameBadge}>{heroName}</p>
                  </div>
                ) : null}

                {currentInfo ? (
                  <div style={styles.heroInfoOverlay}>
                    <p style={styles.heroInfoTitle}>{currentInfo.title}</p>
                    <p style={styles.heroInfoText}>{currentInfo.lines.join('\n')}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.overlayPanel}>
        <div style={styles.overlayButtonsRow}>
          {dockItems.map((item) => {
            if (item.type === 'action') {
              return (
                <button
                  key={item.key}
                  type="button"
                  style={styles.overlayActionButton}
                  onClick={() => handleDockAction(item.key)}
                >
                  {item.label}
                </button>
              )
            }

            return (
              <button
                key={item.key}
                type="button"
                style={styles.overlayButton(activeOverlay === item.key)}
                onClick={() => handleOverlayButton(item.key)}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        {activeOverlay === 'settings' ? (
          <div style={styles.settingsPanel}>
            <div style={styles.settingsSection}>
              <h3 style={styles.settingsHeading}>브금 제어</h3>
              <div style={styles.settingsRow}>
                <p style={styles.settingsLabel}>캐릭터 브금</p>
                <button
                  type="button"
                  style={styles.toggleButton(bgmEnabled)}
                  onClick={handleBgmToggle}
                  aria-pressed={bgmEnabled}
                >
                  <span style={styles.toggleKnob(bgmEnabled)} />
                </button>
                <p style={styles.settingsHelper}>
                  {bgmEnabled ? '이미지를 보는 동안 테마 BGM이 계속 재생됩니다.' : '브금을 꺼두면 캐릭터 진입 시에도 음악이 재생되지 않습니다.'}
                </p>
              </div>
              <div style={styles.settingsRow}>
                <p style={styles.settingsLabel}>재생 음량 {Math.round(volume * 100)}%</p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  style={styles.slider}
                />
                <p style={styles.settingsHelper}>기기에 저장되어 다음 방문 시에도 동일한 음량으로 재생됩니다.</p>
              </div>
            </div>

            <div style={styles.settingsSection}>
              <h3 style={styles.settingsHeading}>음향 효과</h3>
              <div style={styles.settingsRow}>
                <p style={styles.settingsLabel}>이퀄라이저 ({currentEqPresetLabel})</p>
                <div style={styles.settingsButtonRow}>
                  {eqPresets.map((preset) => {
                    const isActive = eqPreset === preset.key
                    const presetStyle = {
                      ...styles.settingsButton,
                      border: isActive
                        ? '1px solid rgba(56,189,248,0.95)'
                        : styles.settingsButton.border,
                      background: isActive ? 'rgba(56,189,248,0.18)' : styles.settingsButton.background,
                      color: isActive ? '#f0f9ff' : styles.settingsButton.color,
                    }
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        style={presetStyle}
                        onClick={() => handleEqSelect(preset.key)}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <p style={styles.settingsHelper}>프리셋은 현재 기기에만 적용되며 곧 세부 조정 기능이 추가될 예정입니다.</p>
              </div>
              <div style={styles.settingsRow}>
                <p style={styles.settingsLabel}>효과음 및 공간감</p>
                <button
                  type="button"
                  style={styles.toggleButton(effectsEnabled)}
                  onClick={handleEffectsToggle}
                  aria-pressed={effectsEnabled}
                >
                  <span style={styles.toggleKnob(effectsEnabled)} />
                </button>
                <p style={styles.settingsHelper}>
                  {effectsEnabled
                    ? '적당한 공간감과 충돌 효과가 적용됩니다.'
                    : '효과음을 최소화하여 조용한 분위기로 플레이합니다.'}
                </p>
              </div>
            </div>

            <div style={styles.settingsSection}>
              <h3 style={styles.settingsHeading}>캐릭터 관리</h3>
              <div style={styles.settingsButtonRow}>
                <button
                  type="button"
                  style={styles.settingsButton}
                  onClick={() => {
                    setShowEditForm((prev) => !prev)
                    setStatusMessage(null)
                  }}
                >
                  {showEditForm ? '편집 닫기' : '캐릭터 편집'}
                </button>
              </div>
              {showEditForm ? (
                <>
                  <div style={styles.editForm}>
                    <div style={styles.editField}>
                      <label style={styles.editLabel} htmlFor="hero-name">
                        이름
                      </label>
                      <input
                        id="hero-name"
                        style={styles.editInput}
                        value={editDraft.name}
                        onChange={(event) => handleDraftChange('name', event.target.value)}
                      />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel} htmlFor="hero-description">
                        설명
                      </label>
                      <textarea
                        id="hero-description"
                        style={styles.editTextarea}
                        value={editDraft.description}
                        onChange={(event) => handleDraftChange('description', event.target.value)}
                      />
                    </div>
                    {[1, 2, 3, 4].map((index) => (
                      <div key={`ability-${index}`} style={styles.editField}>
                        <label style={styles.editLabel} htmlFor={`hero-ability-${index}`}>
                          능력 {index}
                        </label>
                        <input
                          id={`hero-ability-${index}`}
                          style={styles.editInput}
                          value={editDraft[`ability${index}`]}
                          onChange={(event) => handleDraftChange(`ability${index}`, event.target.value)}
                        />
                      </div>
                    ))}
                    <div style={styles.editField}>
                      <label style={styles.editLabel} htmlFor="hero-image">
                        캐릭터 이미지 URL
                      </label>
                      <input
                        id="hero-image"
                        style={styles.editInput}
                        value={editDraft.image_url}
                        onChange={(event) => handleDraftChange('image_url', event.target.value)}
                      />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel} htmlFor="hero-background">
                        배경 이미지 URL
                      </label>
                      <input
                        id="hero-background"
                        style={styles.editInput}
                        value={editDraft.background_url}
                        onChange={(event) => handleDraftChange('background_url', event.target.value)}
                      />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel} htmlFor="hero-bgm">
                        브금 URL
                      </label>
                      <input
                        id="hero-bgm"
                        style={styles.editInput}
                        value={editDraft.bgm_url}
                        onChange={(event) => handleDraftChange('bgm_url', event.target.value)}
                      />
                    </div>
                  </div>
                  <div style={styles.formActions}>
                    <button
                      type="button"
                      style={{
                        ...styles.primaryFormButton,
                        opacity: savingHero ? 0.7 : 1,
                        cursor: savingHero ? 'wait' : 'pointer',
                      }}
                      onClick={handleSaveDraft}
                      disabled={savingHero}
                    >
                      {savingHero ? '저장 중…' : '저장'}
                    </button>
                    <button
                      type="button"
                      style={{
                        ...styles.secondaryFormButton,
                        opacity: savingHero ? 0.7 : 1,
                        cursor: savingHero ? 'not-allowed' : 'pointer',
                      }}
                      onClick={handleResetDraft}
                      disabled={savingHero}
                    >
                      되돌리기
                    </button>
                    <button
                      type="button"
                      style={{
                        ...styles.dangerButton,
                        opacity: savingHero ? 0.7 : 1,
                        cursor: savingHero ? 'not-allowed' : 'pointer',
                      }}
                      onClick={handleDeleteHero}
                      disabled={savingHero}
                    >
                      캐릭터 삭제
                    </button>
                  </div>
                </>
              ) : (
                <p style={styles.settingsHelper}>
                  캐릭터 정보를 빠르게 수정하고 저장하거나 필요하다면 삭제할 수 있습니다.
                </p>
              )}
              {statusMessage ? (
                <p style={styles.statusText(statusMessage.type)}>{statusMessage.text}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p style={styles.overlayCopy}>{overlayDescription}</p>
        )}
      </div>
    </>
  )
}
