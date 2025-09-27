'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import { sanitizeFileName } from '@/utils/characterAssets'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024
const MAX_AUDIO_SIZE = 12 * 1024 * 1024
const MAX_AUDIO_DURATION = 5 * 60
const EQ_FREQUENCIES = [80, 750, 3500]

const pageStyles = {
  base: {
    minHeight: '100dvh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 12px 168px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100dvh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 12px 168px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const overlayTabs = [
  { key: 'character', label: '캐릭터' },
  { key: 'search', label: '방 검색' },
  { key: 'ranking', label: '랭킹' },
  { key: 'settings', label: '설정' },
]

const styles = {
  stage: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '160%',
    borderRadius: 30,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
    cursor: 'pointer',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
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
    padding: '24px 26px 30px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlaySurface: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '10%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    pointerEvents: 'none',
  },
  overlayTextBlock: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.7,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
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
  dock: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 28,
    padding: '18px 18px 20px',
    boxSizing: 'border-box',
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(96,165,250,0.28)',
    boxShadow: '0 44px 120px -70px rgba(37,99,235,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxHeight: 'min(58dvh, 460px)',
    overflowY: 'auto',
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  battleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 18,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    background: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
    color: '#0f172a',
    cursor: 'pointer',
    boxShadow: '0 18px 42px -24px rgba(250,204,21,0.7)',
  },
  dockTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  dockTabButton: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: active ? '#0f172a' : '#e2e8f0',
    background: active ? '#38bdf8' : 'rgba(51,65,85,0.62)',
    cursor: 'pointer',
    transition: 'all 0.24s ease',
  }),
  tabContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  infoBlock: {
    background: 'rgba(15,23,42,0.62)',
    borderRadius: 20,
    padding: '16px 18px',
    border: '1px solid rgba(94, 234, 212, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  infoTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#bae6fd',
  },
  infoText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.7,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
  sectionHint: {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'rgba(148,163,184,0.75)',
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  ghostButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.45)',
    color: '#e2e8f0',
    borderRadius: 14,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 16,
    padding: '9px 18px',
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  dangerButton: {
    appearance: 'none',
    border: '1px solid rgba(248,113,113,0.4)',
    borderRadius: 14,
    padding: '8px 14px',
    background: 'rgba(127,29,29,0.35)',
    color: '#fecaca',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerShell: {
    background: 'rgba(8,47,73,0.68)',
    borderRadius: 20,
    padding: '12px 14px',
    border: '1px solid rgba(56,189,248,0.32)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    pointerEvents: 'auto',
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  playerHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  collapseButton: {
    appearance: 'none',
    border: 'none',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    borderRadius: 14,
    width: 28,
    height: 28,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  playerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0f2fe',
  },
  progressBar: {
    position: 'relative',
    flex: 1,
    height: 6,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  progressFill: (ratio) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: `${Math.min(Math.max(ratio * 100, 0), 100)}%`,
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
  }),
  playerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  playerButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '7px 14px',
    background: 'rgba(15,23,42,0.68)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerMessage: {
    margin: 0,
    fontSize: 13,
    color: '#e2e8f0',
  },
  hudContainer: {
    position: 'fixed',
    left: '50%',
    bottom: 12,
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100% - 24px))',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    zIndex: 40,
    pointerEvents: 'none',
    maxHeight: 'calc(100dvh - 24px)',
    justifyContent: 'flex-end',
  },
  hudSection: {
    pointerEvents: 'auto',
  },
  dockContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dockToggleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  dockToggleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 14,
    padding: '6px 12px',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 10px 26px -20px rgba(14,116,144,0.75)',
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sliderLabel: {
    fontSize: 13,
    color: '#cbd5f5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rangeInput: {
    width: '100%',
  },
  advancedPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 8,
  },
  eqColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  eqSlider: {
    writingMode: 'bt-lr',
    WebkitAppearance: 'slider-vertical',
    height: 120,
  },
  searchGrid: {
    display: 'grid',
    gap: 16,
  },
  searchActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 16,
    padding: '10px 16px',
    background: 'rgba(59,130,246,0.3)',
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  listItem: {
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(30,41,59,0.76)',
    border: '1px solid rgba(71,85,105,0.6)',
  },
  listTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  listMeta: {
    margin: '6px 0 0',
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
  },
  settingsGroup: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid rgba(148,163,184,0.16)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  effectToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  effectTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  togglePill: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    background: active ? 'rgba(56,189,248,0.28)' : 'rgba(51,65,85,0.6)',
    color: active ? '#0f172a' : '#e2e8f0',
    cursor: 'pointer',
  }),
  eqGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  },
  eqSliderLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sliderLabelSmall: {
    fontSize: 12,
    color: '#e2e8f0',
  },
  smallRange: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    appearance: 'none',
  },
  smallValue: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.8)',
  },
  rankingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  settingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  textField: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  textareaField: {
    width: '100%',
    minHeight: 120,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  formActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  uploadSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  previewFrame: {
    width: '100%',
    maxWidth: 180,
    minHeight: 120,
    borderRadius: 16,
    background: 'rgba(30,41,59,0.7)',
    border: '1px solid rgba(71,85,105,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  previewFallback: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
  },
  uploadButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.45)',
    borderRadius: 14,
    padding: '8px 14px',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  inlineActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  errorText: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#fda4af',
  },
}

export default function CharacterBasicView({ hero }) {
  const [currentHero, setCurrentHero] = useState(hero || null)

  useEffect(() => {
    setCurrentHero(hero || null)
  }, [hero])

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

  const abilityPairs = useMemo(() => {
    if (!currentHero) {
      return []
    }

    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(currentHero.ability1), normalize(currentHero.ability2)].filter(Boolean)
    const secondPair = [normalize(currentHero.ability3), normalize(currentHero.ability4)].filter(Boolean)

    return [
      { label: '능력 1 & 2', entries: firstPair },
      { label: '능력 3 & 4', entries: secondPair },
    ].filter((pair) => pair.entries.length > 0)
  }, [currentHero])

  const [viewMode, setViewMode] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [bgmEnabled, setBgmEnabled] = useState(Boolean(hero?.bgm_url))
  const [isPlaying, setIsPlaying] = useState(false)
  const [playerCollapsed, setPlayerCollapsed] = useState(false)
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedBgmName, setSelectedBgmName] = useState('')
  const [customBgmUrl, setCustomBgmUrl] = useState(null)
  const [bgmVolume, setBgmVolume] = useState(0.8)
  const [eqEnabled, setEqEnabled] = useState(false)
  const [equalizer, setEqualizer] = useState({ low: 0, mid: 0, high: 0 })
  const [reverbEnabled, setReverbEnabled] = useState(false)
  const [reverbDetail, setReverbDetail] = useState({ mix: 0.3, decay: 1.8 })
  const [compressorEnabled, setCompressorEnabled] = useState(false)
  const [compressorDetail, setCompressorDetail] = useState({ threshold: -28, ratio: 2.5, release: 0.25 })
  const [isEditing, setIsEditing] = useState(false)
  const [draftHero, setDraftHero] = useState(null)
  const [imagePreview, setImagePreview] = useState(hero?.image_url || '')
  const [backgroundPreview, setBackgroundPreview] = useState(hero?.background_url || '')
  const [imageFile, setImageFile] = useState(null)
  const [backgroundFile, setBackgroundFile] = useState(null)
  const [bgmFile, setBgmFile] = useState(null)
  const [bgmDurationSeconds, setBgmDurationSeconds] = useState(hero?.bgm_duration_seconds || null)
  const [bgmMime, setBgmMime] = useState(hero?.bgm_mime || null)
  const [bgmError, setBgmError] = useState('')
  const [bgmCleared, setBgmCleared] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const imageInputRef = useRef(null)
  const backgroundInputRef = useRef(null)
  const bgmInputRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const gainNodeRef = useRef(null)
  const eqNodesRef = useRef([])
  const reverbNodeRef = useRef(null)
  const reverbWetGainRef = useRef(null)
  const reverbDryGainRef = useRef(null)
  const reverbMergeRef = useRef(null)
  const compressorNodeRef = useRef(null)
  const previousCustomUrl = useRef(null)
  const eqEnabledRef = useRef(eqEnabled)
  const reverbEnabledRef = useRef(reverbEnabled)
  const reverbMixRef = useRef(reverbDetail.mix)
  const compressorEnabledRef = useRef(compressorEnabled)
  const compressorDetailRef = useRef(compressorDetail)
  const bgmVolumeRef = useRef(bgmVolume)
  const imageObjectUrlRef = useRef(null)
  const backgroundObjectUrlRef = useRef(null)

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }
    return audioContextRef.current
  }, [])

  const refreshReverbBuffer = useCallback(() => {
    const context = audioContextRef.current
    if (!context || !reverbNodeRef.current) return
    const decaySeconds = Math.min(Math.max(reverbDetail.decay, 0.1), 6)
    const length = Math.floor(context.sampleRate * decaySeconds)
    const impulse = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const channelData = impulse.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        const random = Math.random() * 2 - 1
        channelData[i] = random * (1 - i / length)
      }
    }
    reverbNodeRef.current.buffer = impulse
  }, [reverbDetail.decay])

  const connectAudioGraph = useCallback(() => {
    const context = audioContextRef.current
    const source = sourceNodeRef.current
    const gainNode = gainNodeRef.current
    if (!context || !source || !gainNode) return

    try {
      source.disconnect()
    } catch (error) {}
    eqNodesRef.current.forEach((node) => {
      try {
        node.disconnect()
      } catch (error) {}
    })
    if (reverbNodeRef.current) {
      try {
        reverbNodeRef.current.disconnect()
      } catch (error) {}
    }
    if (reverbWetGainRef.current) {
      try {
        reverbWetGainRef.current.disconnect()
      } catch (error) {}
    }
    if (reverbDryGainRef.current) {
      try {
        reverbDryGainRef.current.disconnect()
      } catch (error) {}
    }
    if (reverbMergeRef.current) {
      try {
        reverbMergeRef.current.disconnect()
      } catch (error) {}
    }
    if (compressorNodeRef.current) {
      try {
        compressorNodeRef.current.disconnect()
      } catch (error) {}
    }
    try {
      gainNode.disconnect()
    } catch (error) {}

    gainNode.gain.value = bgmVolumeRef.current

    let cursor = source
    if (eqEnabledRef.current && eqNodesRef.current.length) {
      eqNodesRef.current.forEach((node) => {
        cursor.connect(node)
        cursor = node
      })
    }

    const dryGain = reverbDryGainRef.current || ensureAudioContext()?.createGain()
    const wetGain = reverbWetGainRef.current || ensureAudioContext()?.createGain()
    const mergeGain = reverbMergeRef.current || ensureAudioContext()?.createGain()

    if (dryGain) reverbDryGainRef.current = dryGain
    if (wetGain) reverbWetGainRef.current = wetGain
    if (mergeGain) reverbMergeRef.current = mergeGain

    if (dryGain) {
      try {
        dryGain.disconnect()
      } catch (error) {}
    }
    if (wetGain) {
      try {
        wetGain.disconnect()
      } catch (error) {}
    }
    if (mergeGain) {
      try {
        mergeGain.disconnect()
      } catch (error) {}
    }

    let postEffectNode = cursor

    if (reverbEnabledRef.current && wetGain && dryGain && mergeGain && reverbNodeRef.current) {
      const mix = Math.min(Math.max(reverbMixRef.current, 0), 1)
      dryGain.gain.value = Math.max(0, 1 - mix)
      wetGain.gain.value = mix

      cursor.connect(dryGain)
      cursor.connect(wetGain)
      dryGain.connect(mergeGain)
      wetGain.connect(reverbNodeRef.current)
      reverbNodeRef.current.connect(mergeGain)
      postEffectNode = mergeGain
    } else if (dryGain) {
      dryGain.gain.value = 1
      cursor.connect(dryGain)
      postEffectNode = dryGain
    }

    let dynamicsInput = postEffectNode
    if (compressorEnabledRef.current && compressorNodeRef.current) {
      const detail = compressorDetailRef.current
      compressorNodeRef.current.threshold.value = detail.threshold
      compressorNodeRef.current.ratio.value = detail.ratio
      compressorNodeRef.current.release.value = detail.release
      compressorNodeRef.current.attack.value = 0.003
      dynamicsInput.connect(compressorNodeRef.current)
      dynamicsInput = compressorNodeRef.current
    }

    dynamicsInput.connect(gainNode)
    gainNode.connect(context.destination)
  }, [ensureAudioContext])

  useEffect(() => {
    setViewMode(0)
    setActiveTab(0)
    setBgmEnabled(Boolean(hero?.bgm_url))
    setIsPlaying(false)
    setPlayerCollapsed(false)
    setProgress(0)
    setDuration(0)
    setSelectedBgmName('')
    setCustomBgmUrl(null)
    setEqEnabled(false)
    setEqualizer({ low: 0, mid: 0, high: 0 })
    setReverbEnabled(false)
    setReverbDetail({ mix: 0.3, decay: 1.8 })
    setCompressorEnabled(false)
    setCompressorDetail({ threshold: -28, ratio: 2.5, release: 0.25 })
    setIsEditing(false)
    setDraftHero(
      hero
        ? {
            name: hero.name || '',
            description: hero.description || '',
            ability1: hero.ability1 || '',
            ability2: hero.ability2 || '',
            ability3: hero.ability3 || '',
            ability4: hero.ability4 || '',
          }
        : null,
    )
    setImagePreview(hero?.image_url || '')
    setBackgroundPreview(hero?.background_url || '')
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
      imageObjectUrlRef.current = null
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
      backgroundObjectUrlRef.current = null
    }
    setImageFile(null)
    setBackgroundFile(null)
    setBgmFile(null)
    setBgmDurationSeconds(hero?.bgm_duration_seconds || null)
    setBgmMime(hero?.bgm_mime || null)
    setBgmError('')
    setBgmCleared(false)
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    if (bgmInputRef.current) bgmInputRef.current.value = ''
    setSearchTerm('')
  }, [hero?.id])

  useEffect(() => {
    if (previousCustomUrl.current && previousCustomUrl.current !== customBgmUrl) {
      URL.revokeObjectURL(previousCustomUrl.current)
    }
    previousCustomUrl.current = customBgmUrl
    return () => {
      if (previousCustomUrl.current) {
        URL.revokeObjectURL(previousCustomUrl.current)
      }
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current)
        backgroundObjectUrlRef.current = null
      }
    }
  }, [customBgmUrl])

  const activeBgmUrl = customBgmUrl || currentHero?.bgm_url || null

  useEffect(() => {
    if (!activeBgmUrl || !bgmEnabled) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect()
        } catch (error) {}
        sourceNodeRef.current = null
      }
      eqNodesRef.current.forEach((node) => {
        try {
          node.disconnect()
        } catch (error) {}
      })
      eqNodesRef.current = []
      if (reverbNodeRef.current) {
        try {
          reverbNodeRef.current.disconnect()
        } catch (error) {}
        reverbNodeRef.current = null
      }
      if (reverbWetGainRef.current) {
        try {
          reverbWetGainRef.current.disconnect()
        } catch (error) {}
        reverbWetGainRef.current = null
      }
      if (reverbDryGainRef.current) {
        try {
          reverbDryGainRef.current.disconnect()
        } catch (error) {}
        reverbDryGainRef.current = null
      }
      if (reverbMergeRef.current) {
        try {
          reverbMergeRef.current.disconnect()
        } catch (error) {}
        reverbMergeRef.current = null
      }
      if (compressorNodeRef.current) {
        try {
          compressorNodeRef.current.disconnect()
        } catch (error) {}
        compressorNodeRef.current = null
      }
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect()
        } catch (error) {}
        gainNodeRef.current = null
      }
      setIsPlaying(false)
      setProgress(0)
      setDuration(0)
      return
    }

    const audio = new Audio(activeBgmUrl)
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    const handleLoaded = () => {
      const metaDuration = Number.isFinite(audio.duration) ? audio.duration : 0
      setDuration(metaDuration)
    }

    const handleTime = () => {
      setProgress(audio.currentTime)
    }

    const handleEnded = () => {
      setProgress(audio.duration || 0)
      setIsPlaying(false)
    }

    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('timeupdate', handleTime)
    audio.addEventListener('ended', handleEnded)

    const context = ensureAudioContext()
    if (context) {
      try {
        if (context.state === 'suspended') {
          context.resume().catch(() => {})
        }
      } catch (error) {}
      const source = context.createMediaElementSource(audio)
      sourceNodeRef.current = source

      const gain = context.createGain()
      gain.gain.value = bgmVolumeRef.current
      gainNodeRef.current = gain

      eqNodesRef.current = EQ_FREQUENCIES.map((frequency, index) => {
        const node = context.createBiquadFilter()
        node.type = 'peaking'
        node.frequency.value = frequency
        node.Q.value = index === 1 ? 0.9 : 1.1
        node.gain.value = 0
        return node
      })

      reverbNodeRef.current = context.createConvolver()
      reverbNodeRef.current.normalize = true

      compressorNodeRef.current = context.createDynamicsCompressor()
      compressorNodeRef.current.threshold.value = compressorDetailRef.current.threshold
      compressorNodeRef.current.ratio.value = compressorDetailRef.current.ratio
      compressorNodeRef.current.release.value = compressorDetailRef.current.release
      compressorNodeRef.current.attack.value = 0.003

      refreshReverbBuffer()
      connectAudioGraph()
    }

    const startPlayback = async () => {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch (error) {
        setIsPlaying(false)
      }
    }

    startPlayback()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('timeupdate', handleTime)
      audio.removeEventListener('ended', handleEnded)
      if (audioRef.current === audio) {
        audioRef.current = null
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect()
        } catch (error) {}
        sourceNodeRef.current = null
      }
      eqNodesRef.current.forEach((node) => {
        try {
          node.disconnect()
        } catch (error) {}
      })
      eqNodesRef.current = []
      if (reverbNodeRef.current) {
        try {
          reverbNodeRef.current.disconnect()
        } catch (error) {}
        reverbNodeRef.current = null
      }
      if (reverbWetGainRef.current) {
        try {
          reverbWetGainRef.current.disconnect()
        } catch (error) {}
        reverbWetGainRef.current = null
      }
      if (reverbDryGainRef.current) {
        try {
          reverbDryGainRef.current.disconnect()
        } catch (error) {}
        reverbDryGainRef.current = null
      }
      if (reverbMergeRef.current) {
        try {
          reverbMergeRef.current.disconnect()
        } catch (error) {}
        reverbMergeRef.current = null
      }
      if (compressorNodeRef.current) {
        try {
          compressorNodeRef.current.disconnect()
        } catch (error) {}
        compressorNodeRef.current = null
      }
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect()
        } catch (error) {}
        gainNodeRef.current = null
      }
    }
  }, [activeBgmUrl, bgmEnabled, connectAudioGraph, ensureAudioContext, refreshReverbBuffer])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.play().catch(() => {
        setIsPlaying(false)
      })
    } else {
      audio.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    eqEnabledRef.current = eqEnabled
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [eqEnabled, connectAudioGraph])

  useEffect(() => {
    bgmVolumeRef.current = bgmVolume
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = bgmVolume
    }
  }, [bgmVolume])

  useEffect(() => {
    reverbEnabledRef.current = reverbEnabled
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [reverbEnabled, connectAudioGraph])

  useEffect(() => {
    reverbMixRef.current = reverbDetail.mix
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [reverbDetail.mix, connectAudioGraph])

  useEffect(() => {
    compressorEnabledRef.current = compressorEnabled
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [compressorEnabled, connectAudioGraph])

  useEffect(() => {
    compressorDetailRef.current = compressorDetail
    if (compressorNodeRef.current) {
      compressorNodeRef.current.threshold.value = compressorDetail.threshold
      compressorNodeRef.current.ratio.value = compressorDetail.ratio
      compressorNodeRef.current.release.value = compressorDetail.release
    }
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [compressorDetail, connectAudioGraph])

  useEffect(() => {
    if (!eqNodesRef.current.length) return
    const values = [equalizer.low, equalizer.mid, equalizer.high]
    eqNodesRef.current.forEach((node, index) => {
      node.frequency.value = EQ_FREQUENCIES[index]
      node.Q.value = index === 1 ? 0.9 : 1.1
      node.gain.value = eqEnabledRef.current ? values[index] ?? 0 : 0
    })
    if (gainNodeRef.current) {
      connectAudioGraph()
    }
  }, [equalizer, connectAudioGraph])

  useEffect(() => {
    refreshReverbBuffer()
  }, [refreshReverbBuffer, reverbDetail.decay])

  const backgroundStyle = currentHero?.background_url
    ? pageStyles.withBackground(currentHero.background_url)
    : pageStyles.base

  const overlayModes = useMemo(() => {
    const modes = ['name', 'description']
    if (!abilityPairs.length) {
      modes.push('ability-empty')
    } else {
      abilityPairs.forEach((_, index) => {
        modes.push(`ability-${index}`)
      })
    }
    return modes
  }, [abilityPairs])

  const currentOverlayMode = overlayModes[viewMode] || 'name'

  const imageStyle = {
    ...styles.heroImage,
    filter: currentOverlayMode === 'name' ? 'none' : 'brightness(0.72)',
  }

  const handleTap = () => {
    if (!overlayModes.length) return
    setViewMode((prev) => (prev + 1) % overlayModes.length)
  }

  const formatTime = (value) => {
    if (!value || Number.isNaN(value)) return '0:00'
    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSeek = (event) => {
    if (!duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const clamped = Math.min(Math.max(ratio, 0), 1)
    const audio = audioRef.current
    if (audio) {
      const nextTime = clamped * duration
      audio.currentTime = nextTime
      setProgress(nextTime)
    }
  }

  const togglePlayback = () => {
    if (!activeBgmUrl) return
    setIsPlaying((prev) => !prev)
  }

  const stopPlayback = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setProgress(0)
    setIsPlaying(false)
  }

  const handleBgmToggle = () => {
    setBgmEnabled((prev) => !prev)
  }

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert('이미지는 5MB를 넘을 수 없습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
    }
    const objectUrl = URL.createObjectURL(file)
    imageObjectUrlRef.current = objectUrl
    setImagePreview(objectUrl)
    setImageFile(file)
    // eslint-disable-next-line no-param-reassign
    event.target.value = ''
  }

  const handleBackgroundChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('배경은 이미지 파일만 업로드할 수 있습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      alert('배경 이미지는 8MB를 넘을 수 없습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
    }
    const objectUrl = URL.createObjectURL(file)
    backgroundObjectUrlRef.current = objectUrl
    setBackgroundPreview(objectUrl)
    setBackgroundFile(file)
    // eslint-disable-next-line no-param-reassign
    event.target.value = ''
  }

  const handleBgmFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setBgmError('')

    if (!file.type.startsWith('audio/')) {
      setBgmError('오디오 파일만 업로드할 수 있습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }
    if (file.size > MAX_AUDIO_SIZE) {
      setBgmError('오디오는 12MB 이하만 업로드할 수 있습니다.')
      // eslint-disable-next-line no-param-reassign
      event.target.value = ''
      return
    }

    const tempUrl = URL.createObjectURL(file)
    setCustomBgmUrl(tempUrl)
    setSelectedBgmName(file.name || '선택한 오디오')
    setBgmEnabled(true)
    setProgress(0)
    setDuration(0)
    setIsPlaying(false)
    setBgmCleared(false)

    try {
      const durationValue = await new Promise((resolve, reject) => {
        const probe = document.createElement('audio')
        probe.preload = 'metadata'
        probe.onloadedmetadata = () => {
          if (!Number.isFinite(probe.duration)) {
            reject(new Error('재생 시간을 확인할 수 없습니다.'))
            return
          }
          resolve(probe.duration)
        }
        probe.onerror = () => reject(new Error('오디오 정보를 불러올 수 없습니다.'))
        probe.src = tempUrl
      })

      if (durationValue > MAX_AUDIO_DURATION) {
        setBgmError('브금은 5분을 넘을 수 없습니다.')
        setCustomBgmUrl(currentHero?.bgm_url || null)
        setSelectedBgmName('')
        URL.revokeObjectURL(tempUrl)
        setBgmFile(null)
        setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
        setBgmMime(currentHero?.bgm_mime || null)
      } else {
        setBgmFile(file)
        setBgmDurationSeconds(Math.round(durationValue))
        setBgmMime(file.type || null)
      }
    } catch (error) {
      setBgmError(error.message || '오디오를 불러올 수 없습니다.')
      setCustomBgmUrl(currentHero?.bgm_url || null)
      setSelectedBgmName('')
      URL.revokeObjectURL(tempUrl)
      setBgmFile(null)
      setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
      setBgmMime(currentHero?.bgm_mime || null)
    }

    // eslint-disable-next-line no-param-reassign
    event.target.value = ''
  }

  const uploadHeroAsset = useCallback(
    async (file, folder, fallbackName) => {
      if (!file) return null
      const extensionFromName = file.name ? file.name.split('.').pop() : ''
      const extension = (extensionFromName || file.type?.split('/')[1] || 'bin').toLowerCase()
      const safeBase = sanitizeFileName(fallbackName || heroName || 'hero-asset')
      const path = `${folder}/${Date.now()}-${safeBase}.${extension}`
      const { error } = await supabase.storage
        .from('heroes')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
      if (error) throw error
      const { data } = supabase.storage.from('heroes').getPublicUrl(path)
      return data?.publicUrl || null
    },
    [heroName],
  )

  const handleDraftChange = (field, value) => {
    setDraftHero((prev) => ({
      name: prev?.name || currentHero?.name || '',
      description: prev?.description || currentHero?.description || '',
      ability1: prev?.ability1 || currentHero?.ability1 || '',
      ability2: prev?.ability2 || currentHero?.ability2 || '',
      ability3: prev?.ability3 || currentHero?.ability3 || '',
      ability4: prev?.ability4 || currentHero?.ability4 || '',
      [field]: value,
    }))
  }

  const resetDraftToHero = useCallback(() => {
    setDraftHero(
      currentHero
        ? {
            name: currentHero.name || '',
            description: currentHero.description || '',
            ability1: currentHero.ability1 || '',
            ability2: currentHero.ability2 || '',
            ability3: currentHero.ability3 || '',
            ability4: currentHero.ability4 || '',
          }
        : null,
    )
  }, [currentHero])

  const handleSaveDraft = async () => {
    if (!currentHero?.id || !draftHero) {
      alert('저장할 캐릭터 정보를 찾을 수 없습니다.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: draftHero.name?.trim() || DEFAULT_HERO_NAME,
        description: draftHero.description || '',
        ability1: draftHero.ability1 || '',
        ability2: draftHero.ability2 || '',
        ability3: draftHero.ability3 || '',
        ability4: draftHero.ability4 || '',
      }

      let imageUrl = currentHero.image_url || null
      if (imageFile) {
        imageUrl = await uploadHeroAsset(imageFile, 'hero-image', payload.name)
      }

      let backgroundUrl = currentHero.background_url || null
      if (backgroundFile) {
        backgroundUrl = await uploadHeroAsset(backgroundFile, 'hero-background', payload.name)
      }

      let bgmUrl = currentHero.bgm_url || null
      let nextDuration = bgmDurationSeconds
      let nextMime = bgmMime
      if (bgmFile) {
        bgmUrl = await uploadHeroAsset(bgmFile, 'hero-bgm', payload.name)
      }
      if (bgmCleared && !bgmFile) {
        bgmUrl = null
      }
      if (!bgmUrl) {
        nextDuration = null
        nextMime = null
      }

      const fullPayload = {
        ...payload,
        image_url: imageUrl,
        background_url: backgroundUrl,
        bgm_url: bgmUrl,
        bgm_duration_seconds: nextDuration,
        bgm_mime: nextMime,
      }

      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).update(fullPayload).eq('id', currentHero.id)
      )
      if (error) throw error

      const nextHero = {
        ...currentHero,
        ...fullPayload,
      }

      setCurrentHero(nextHero)
      setDraftHero({
        name: fullPayload.name,
        description: fullPayload.description,
        ability1: fullPayload.ability1,
        ability2: fullPayload.ability2,
        ability3: fullPayload.ability3,
        ability4: fullPayload.ability4,
      })
      setImagePreview(imageUrl || '')
      setBackgroundPreview(backgroundUrl || '')
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current)
        backgroundObjectUrlRef.current = null
      }
      setImageFile(null)
      setBackgroundFile(null)
      setBgmFile(null)
      setCustomBgmUrl(null)
      setBgmDurationSeconds(nextDuration)
      setBgmMime(nextMime)
      setSelectedBgmName('')
      setBgmEnabled(Boolean(bgmUrl))
      setBgmCleared(false)
      setIsPlaying(false)
      setProgress(0)
      setDuration(nextDuration || 0)
      alert('저장 완료')
      setIsEditing(false)
    } catch (error) {
      console.error(error)
      alert(error.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    resetDraftToHero()
    setBgmError('')
    setCustomBgmUrl(null)
    setSelectedBgmName('')
    setBgmFile(null)
    setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
    setBgmMime(currentHero?.bgm_mime || null)
    setBgmEnabled(Boolean(currentHero?.bgm_url))
    setBgmCleared(false)
    setProgress(0)
    setDuration(currentHero?.bgm_duration_seconds || 0)
    setIsPlaying(false)
    setImagePreview(currentHero?.image_url || '')
    setBackgroundPreview(currentHero?.background_url || '')
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
      imageObjectUrlRef.current = null
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
      backgroundObjectUrlRef.current = null
    }
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    if (bgmInputRef.current) bgmInputRef.current.value = ''
    setIsEditing(false)
  }

  const handleDeleteHero = async () => {
    if (!currentHero?.id) {
      alert('삭제할 캐릭터를 찾을 수 없습니다.')
      return
    }
    if (!confirm('정말 캐릭터를 삭제할까요?')) return
    if (!confirm('삭제 후에는 복구할 수 없습니다. 계속하시겠어요?')) return

    setSaving(true)
    try {
      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).delete().eq('id', currentHero.id)
      )
      if (error) throw error
      alert('캐릭터가 삭제되었습니다.')
      if (typeof window !== 'undefined') {
        window.location.href = '/roster'
      }
    } catch (error) {
      console.error(error)
      alert(error.message || '캐릭터 삭제에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const sampleGames = useMemo(
    () => [
      { id: 'g-1', title: '시간의 미궁', tags: ['추리', '협동'], players: 6, likes: 128 },
      { id: 'g-2', title: '하늘섬 레이드', tags: ['레이드', '전략'], players: 8, likes: 256 },
      { id: 'g-3', title: '은하 결투장', tags: ['PvP', '실시간'], players: 10, likes: 92 },
      { id: 'g-4', title: '꿈의 정원', tags: ['힐링', '건설'], players: 4, likes: 64 },
    ],
    [],
  )

  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) return sampleGames
    const term = searchTerm.trim().toLowerCase()
    return sampleGames.filter((game) => {
      const target = `${game.title} ${game.tags.join(' ')}`.toLowerCase()
      return target.includes(term)
    })
  }, [sampleGames, searchTerm])

  const rankingEntries = useMemo(
    () => [
      { id: 'r-1', name: '아크메이지', score: 9820 },
      { id: 'r-2', name: '용맹한 기사', score: 9350 },
      { id: 'r-3', name: '그림자 추적자', score: 8890 },
      { id: 'r-4', name: '별빛 수호자', score: 8520 },
    ],
    [],
  )

  const activeTabKey = overlayTabs[activeTab]?.key ?? 'character'
  const progressRatio = duration ? progress / duration : 0

  const overlayBody = (() => {
    if (activeTabKey === 'search') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>방 검색</p>
            <input
              style={styles.searchInput}
              placeholder="찾고 싶은 게임 이름이나 태그를 입력해 보세요."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div style={styles.searchActions}>
              <button type="button" style={styles.searchButton}>
                게임 제작
              </button>
              <button type="button" style={styles.searchButton}>
                게임 등록
              </button>
            </div>
          </div>
          <div style={styles.searchGrid}>
            {filteredGames.map((game) => (
              <div key={game.id} style={styles.listItem}>
                <p style={styles.listTitle}>{game.title}</p>
                <p style={styles.listMeta}>{`${game.players}인 · 좋아요 ${game.likes}개`}</p>
                <p style={styles.listMeta}>{game.tags.join(' / ')}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTabKey === 'ranking') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>시즌 랭킹</p>
            <div style={styles.rankingList}>
              {rankingEntries.map((entry, index) => (
                <div key={entry.id} style={styles.listItem}>
                  <p style={styles.listTitle}>{`${index + 1}위 · ${entry.name}`}</p>
                  <p style={styles.listMeta}>{`점수 ${entry.score.toLocaleString()}점`}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'settings') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>브금 제어</p>
            <div style={styles.buttonRow}>
              <button type="button" style={styles.ghostButton} onClick={handleBgmToggle}>
                {bgmEnabled ? '브금 끄기' : '브금 켜기'}
              </button>
            </div>
            <div style={styles.sliderRow}>
              <label style={styles.sliderLabel}>
                볼륨
                <span>{`${Math.round(bgmVolume * 100)}%`}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(bgmVolume * 100)}
                onChange={(event) => setBgmVolume(Number(event.target.value) / 100)}
                style={styles.rangeInput}
              />
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>이퀄라이저</p>
                <button type="button" style={styles.togglePill(eqEnabled)} onClick={() => setEqEnabled((prev) => !prev)}>
                  {eqEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>저음·중음·고음을 직접 다듬어 원하는 사운드를 만들어 보세요.</p>
              <div style={styles.eqGrid}>
                {[
                  { key: 'low', label: '저음' },
                  { key: 'mid', label: '중음' },
                  { key: 'high', label: '고음' },
                ].map((band) => (
                  <label key={band.key} style={styles.eqSliderLabel}>
                    <span style={styles.sliderLabelSmall}>{band.label}</span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={equalizer[band.key]}
                      onChange={(event) =>
                        setEqualizer((prev) => ({ ...prev, [band.key]: Number(event.target.value) }))
                      }
                      style={styles.smallRange}
                      disabled={!eqEnabled}
                    />
                    <span style={styles.smallValue}>{eqEnabled ? `${equalizer[band.key]} dB` : '비활성화'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>리버브</p>
                <button
                  type="button"
                  style={styles.togglePill(reverbEnabled)}
                  onClick={() => setReverbEnabled((prev) => !prev)}
                >
                  {reverbEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>잔향의 길이와 섞이는 비율을 조절해 공연장 같은 울림을 연출합니다.</p>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  믹스 비율
                  <span>{`${Math.round(reverbDetail.mix * 100)}%`}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(reverbDetail.mix * 100)}
                  onChange={(event) =>
                    setReverbDetail((prev) => ({ ...prev, mix: Number(event.target.value) / 100 }))
                  }
                  style={styles.rangeInput}
                  disabled={!reverbEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  잔향 길이
                  <span>{`${reverbDetail.decay.toFixed(1)}s`}</span>
                </label>
                <input
                  type="range"
                  min={20}
                  max={500}
                  value={Math.round(reverbDetail.decay * 100)}
                  onChange={(event) =>
                    setReverbDetail((prev) => ({ ...prev, decay: Number(event.target.value) / 100 }))
                  }
                  style={styles.rangeInput}
                  disabled={!reverbEnabled}
                />
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>컴프레서</p>
                <button
                  type="button"
                  style={styles.togglePill(compressorEnabled)}
                  onClick={() => setCompressorEnabled((prev) => !prev)}
                >
                  {compressorEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>소리의 폭을 좁혀 더욱 또렷한 음량을 유지하도록 도와줍니다.</p>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  임계값
                  <span>{`${compressorDetail.threshold} dB`}</span>
                </label>
                <input
                  type="range"
                  min={-60}
                  max={0}
                  value={compressorDetail.threshold}
                  onChange={(event) =>
                    setCompressorDetail((prev) => ({ ...prev, threshold: Number(event.target.value) }))
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  비율
                  <span>{`${compressorDetail.ratio.toFixed(1)}:1`}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={Math.round(compressorDetail.ratio * 10)}
                  onChange={(event) =>
                    setCompressorDetail((prev) => ({ ...prev, ratio: Number(event.target.value) / 10 }))
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  릴리즈
                  <span>{`${Math.round(compressorDetail.release * 1000)}ms`}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  value={Math.round(compressorDetail.release * 1000)}
                  onChange={(event) =>
                    setCompressorDetail((prev) => ({ ...prev, release: Number(event.target.value) / 1000 }))
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
            </div>
          </div>

          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>캐릭터 편집</p>
            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.ghostButton}
                onClick={() => {
                  resetDraftToHero()
                  setIsEditing(true)
                }}
                disabled={saving}
              >
                편집 시작
              </button>
              <button type="button" style={styles.dangerButton} onClick={handleDeleteHero} disabled={saving}>
                캐릭터 삭제
              </button>
            </div>
            {isEditing && draftHero ? (
              <form
                style={styles.settingsForm}
                onSubmit={async (event) => {
                  event.preventDefault()
                  await handleSaveDraft()
                }}
              >
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>이름</label>
                  <input
                    style={styles.textField}
                    value={draftHero.name}
                    onChange={(event) => handleDraftChange('name', event.target.value)}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>설명</label>
                  <textarea
                    style={styles.textareaField}
                    value={draftHero.description}
                    onChange={(event) => handleDraftChange('description', event.target.value)}
                  />
                </div>
                {['ability1', 'ability2', 'ability3', 'ability4'].map((field, index) => (
                  <div key={field} style={styles.formRow}>
                    <label style={styles.sliderLabel}>{`능력 ${index + 1}`}</label>
                    <textarea
                      style={styles.textareaField}
                      value={draftHero[field]}
                      onChange={(event) => handleDraftChange(field, event.target.value)}
                    />
                  </div>
                ))}

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="캐릭터 이미지 미리보기" style={styles.previewImage} />
                    ) : (
                      <div style={styles.previewFallback}>이미지 없음</div>
                    )}
                  </div>
                  <button type="button" style={styles.uploadButton} onClick={() => imageInputRef.current?.click()}>
                    이미지 선택
                  </button>
                </div>

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    {backgroundPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={backgroundPreview} alt="배경 미리보기" style={styles.previewImage} />
                    ) : (
                      <div style={styles.previewFallback}>배경 없음</div>
                    )}
                  </div>
                  <button type="button" style={styles.uploadButton} onClick={() => backgroundInputRef.current?.click()}>
                    배경 선택
                  </button>
                </div>

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    <p style={styles.listMeta}>
                      {selectedBgmName
                        ? `선택한 브금: ${selectedBgmName}`
                        : bgmCleared
                          ? '브금이 제거될 예정입니다.'
                          : currentHero?.bgm_url
                            ? '기존 브금이 설정되어 있습니다.'
                            : '등록된 브금이 없습니다.'}
                    </p>
                  </div>
                  <div style={styles.inlineActions}>
                    <button type="button" style={styles.uploadButton} onClick={() => bgmInputRef.current?.click()}>
                      브금 불러오기
                    </button>
                    <button
                      type="button"
                      style={styles.ghostButton}
                      onClick={() => {
                        setBgmFile(null)
                        setCustomBgmUrl(null)
                        setSelectedBgmName('')
                        setBgmDurationSeconds(null)
                        setBgmMime(null)
                        setBgmEnabled(false)
                        setBgmError('')
                        if (bgmInputRef.current) bgmInputRef.current.value = ''
                        setProgress(0)
                        setDuration(0)
                        setIsPlaying(false)
                        setBgmCleared(true)
                      }}
                    >
                      브금 제거
                    </button>
                  </div>
                  {bgmError ? <p style={styles.errorText}>{bgmError}</p> : null}
                </div>

                <div style={styles.formActions}>
                  <button type="submit" style={styles.primaryButton} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <button type="button" style={styles.ghostButton} onClick={handleCancelEdit} disabled={saving}>
                    취소
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div style={styles.tabContent}>
        <div style={styles.infoBlock}>
          <p style={styles.infoTitle}>{heroName}</p>
          <p style={styles.infoText}>{description}</p>
          {abilityPairs.map((pair) => (
            <div key={pair.label}>
              <p style={{ ...styles.infoTitle, marginTop: 12 }}>{pair.label}</p>
              <p style={styles.infoText}>{pair.entries.join('\n')}</p>
            </div>
          ))}
          {!abilityPairs.length ? (
            <p style={styles.listMeta}>등록된 능력이 없습니다.</p>
          ) : null}
        </div>
      </div>
    )
  })()

  const heroSlide = (
    <div style={styles.heroCardShell}>
      <div
        role="button"
        tabIndex={0}
        style={styles.heroCard}
        onClick={handleTap}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleTap()
          }
        }}
      >
        <div style={styles.cornerIcon} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={`dot-${index}`} style={styles.cornerDot} />
          ))}
        </div>

        {hero?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.image_url} alt={heroName} style={imageStyle} />
        ) : (
          <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
        )}

        {currentOverlayMode === 'name' ? (
          <div style={styles.heroNameOverlay}>
            <p style={styles.heroNameBadge}>{heroName}</p>
          </div>
        ) : null}

        {currentOverlayMode === 'description' ? (
          <div style={styles.overlaySurface}>
            <p style={styles.overlayTextBlock}>{description}</p>
          </div>
        ) : null}

        {currentOverlayMode.startsWith('ability-') ? (
          <div style={styles.overlaySurface}>
            {(() => {
              const index = Number.parseInt(currentOverlayMode.split('-')[1] || '0', 10)
              const pair = abilityPairs[index]
              if (!pair) {
                return <p style={styles.overlayTextBlock}>등록된 능력이 없습니다.</p>
              }
              return (
                <p key={pair.label} style={styles.overlayTextBlock}>
                  {`${pair.label}:\n${pair.entries.join('\n')}`}
                </p>
              )
            })()}
          </div>
        ) : null}

        {currentOverlayMode === 'ability-empty' ? (
          <div style={styles.overlaySurface}>
            <p style={styles.overlayTextBlock}>등록된 능력이 없습니다.</p>
          </div>
        ) : null}

        <div style={styles.tapHint} aria-hidden="true">
          탭해서 정보 보기
        </div>
      </div>
    </div>
  )

  const showBgmBar = bgmEnabled

  const bgmBar = !showBgmBar ? null : (
    <div style={{ ...styles.hudSection }}>
      <div style={styles.playerShell}>
        <div style={styles.playerHeader}>
          <div style={styles.playerHeaderLeft}>
            <button
              type="button"
              style={styles.collapseButton}
              onClick={() => setPlayerCollapsed((prev) => !prev)}
              aria-label={playerCollapsed ? '재생바 펼치기' : '재생바 접기'}
            >
              {playerCollapsed ? '▲' : '▼'}
            </button>
            <span style={styles.playerTitle}>캐릭터 브금</span>
          </div>
          {!playerCollapsed && activeBgmUrl ? (
            <>
              <div
                style={styles.progressBar}
                role="presentation"
                onClick={handleSeek}
              >
                <div style={styles.progressFill(progressRatio)} />
              </div>
              <span style={styles.listMeta}>
                {formatTime(progress)} / {formatTime(duration)}
              </span>
            </>
          ) : null}
        </div>

        {!playerCollapsed ? (
          activeBgmUrl ? (
            <div style={styles.playerControls}>
              <button type="button" style={styles.playerButton} onClick={togglePlayback}>
                {isPlaying ? '일시정지' : '재생'}
              </button>
              <button type="button" style={styles.playerButton} onClick={stopPlayback}>
                처음으로
              </button>
            </div>
          ) : (
            <p style={styles.playerMessage}>등록된 브금이 없습니다.</p>
          )
        ) : null}
      </div>
    </div>
  )

  return (
    <div style={backgroundStyle}>
      <div style={styles.stage}>{heroSlide}</div>

      <div style={styles.hudContainer}>
        {bgmBar}
        <div style={{ ...styles.hudSection }}>
          <div style={styles.dockContainer}>
            <div style={styles.dockToggleRow}>
              <button
                type="button"
                style={styles.dockToggleButton}
                onClick={() => setDockCollapsed((prev) => !prev)}
                aria-label={dockCollapsed ? '오버레이 펼치기' : '오버레이 접기'}
              >
                {dockCollapsed ? '▲ 패널 펼치기' : '▼ 패널 접기'}
              </button>
            </div>
            {!dockCollapsed ? (
              <div style={styles.dock}>
                <div style={styles.dockHeader}>
                  <div style={styles.dockTabs}>
                    {overlayTabs.map((tab, index) => (
                      <button
                        key={tab.key}
                        type="button"
                        style={styles.dockTabButton(index === activeTab)}
                        onClick={() => setActiveTab(index)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {activeTabKey === 'character' ? (
                    <button type="button" style={styles.battleButton}>
                      전투 시작
                    </button>
                  ) : null}
                </div>

                {overlayBody}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <input
        type="file"
        accept="image/*"
        ref={imageInputRef}
        style={{ display: 'none' }}
        onChange={handleImageChange}
      />
      <input
        type="file"
        accept="image/*"
        ref={backgroundInputRef}
        style={{ display: 'none' }}
        onChange={handleBackgroundChange}
      />
      <input
        type="file"
        accept="audio/*"
        ref={bgmInputRef}
        style={{ display: 'none' }}
        onChange={handleBgmFileChange}
      />
    </div>
  )
}
