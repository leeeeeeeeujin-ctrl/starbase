'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../lib/supabase'
import { fetchHeroById } from '../services/heroes'
import { fetchHeroParticipationBundle } from '../modules/character/participation'
import { buildAbilityCards, buildBattleSummary, buildStatSlides } from '../utils/characterStats'
import { formatKoreanDate } from '../utils/dateFormatting'

const DEFAULT_HERO_NAME = '이름 없는 캐릭터'

function extractBgmLabel(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length) {
      return decodeURIComponent(segments[segments.length - 1])
    }
    return parsed.hostname || ''
  } catch (error) {
    const fallback = url.split('/').filter(Boolean)
    return fallback.length ? decodeURIComponent(fallback[fallback.length - 1]) : ''
  }
}

export default function useCharacterDashboard(heroId) {
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const requestRef = useRef(0)
  const backgroundInputRef = useRef(null)
  const bgmInputRef = useRef(null)

  const [status, setStatus] = useState({
    loading: true,
    error: '',
    unauthorized: false,
    missingHero: false,
  })
  const [hero, setHero] = useState(null)
  const [participations, setParticipations] = useState([])
  const [scoreboardMap, setScoreboardMap] = useState({})
  const [heroLookup, setHeroLookup] = useState({})
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [statPageIndex, setStatPageIndex] = useState(0)

  const loadData = useCallback(async () => {
    const requestId = ++requestRef.current

    if (!mountedRef.current) return

    if (!heroId) {
      setHero(null)
      setParticipations([])
      setScoreboardMap({})
      setHeroLookup({})
      setSelectedGameId(null)
      setStatus({ loading: false, error: '', unauthorized: false, missingHero: false })
      return
    }

    setStatus((prev) => ({ ...prev, loading: true, error: '', unauthorized: false, missingHero: false }))

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      let user = sessionData?.session?.user || null
      if (!user) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        user = userData?.user || null
      }

      if (!user) {
        if (!mountedRef.current || requestId !== requestRef.current) return
        setHero(null)
        setParticipations([])
        setScoreboardMap({})
        setHeroLookup({})
        setSelectedGameId(null)
        setStatus({ loading: false, error: '', unauthorized: true, missingHero: false })
        return
      }

      const heroRow = await fetchHeroById(heroId)
      if (!mountedRef.current || requestId !== requestRef.current) return

      if (!heroRow) {
        setHero(null)
        setParticipations([])
        setScoreboardMap({})
        setHeroLookup({})
        setSelectedGameId(null)
        setStatus({ loading: false, error: '', unauthorized: false, missingHero: true })
        return
      }

      setHero(heroRow)

      const heroSeed = {
        id: heroRow.id,
        name: heroRow.name || DEFAULT_HERO_NAME,
        image_url: heroRow.image_url || null,
        ability1: heroRow.ability1 || '',
        ability2: heroRow.ability2 || '',
        ability3: heroRow.ability3 || '',
        ability4: heroRow.ability4 || '',
        owner_id: heroRow.owner_id || null,
      }

      const bundle = await fetchHeroParticipationBundle(heroRow.id, { heroSeed })
      if (!mountedRef.current || requestId !== requestRef.current) return

      const formattedParticipations = (bundle.participations || []).map((entry) => ({
        ...entry,
        latestSessionAt: entry.latestSessionAt ? formatKoreanDate(entry.latestSessionAt) : null,
        firstSessionAt: entry.firstSessionAt ? formatKoreanDate(entry.firstSessionAt) : null,
      }))

      setParticipations(formattedParticipations)
      setScoreboardMap(bundle.scoreboardMap || {})
      setHeroLookup(bundle.heroLookup || (heroSeed.id ? { [heroSeed.id]: heroSeed } : {}))
      setSelectedGameId((current) => {
        if (current && formattedParticipations.some((row) => row.game_id === current)) {
          return current
        }
        return formattedParticipations[0]?.game_id || null
      })
      setStatPageIndex(0)
      setStatus({ loading: false, error: '', unauthorized: false, missingHero: false })
    } catch (error) {
      console.error('Failed to load character dashboard:', error)
      if (!mountedRef.current || requestId !== requestRef.current) return
      setStatus({
        loading: false,
        error: error?.message || '캐릭터 정보를 불러오지 못했습니다.',
        unauthorized: false,
        missingHero: false,
      })
    }
  }, [heroId])

  useEffect(() => {
    loadData()
    return () => {
      requestRef.current += 1
    }
  }, [loadData])

  useEffect(() => {
    if (!participations.length) {
      if (selectedGameId) {
        setSelectedGameId(null)
      }
      return
    }
    if (selectedGameId && !participations.some((row) => row.game_id === selectedGameId)) {
      setSelectedGameId(participations[0]?.game_id || null)
    }
  }, [participations, selectedGameId])

  const heroName = useMemo(() => {
    const raw = hero?.name
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim()
    }
    return DEFAULT_HERO_NAME
  }, [hero?.name])

  const abilityCards = useMemo(() => buildAbilityCards(hero), [hero])

  const selectedEntry = useMemo(
    () => participations.find((row) => row.game_id === selectedGameId) || null,
    [participations, selectedGameId],
  )

  const selectedGame = selectedEntry?.game || null

  const selectedScoreboard = useMemo(() => {
    if (!selectedGameId) return []
    const rows = scoreboardMap[selectedGameId] || []
    return [...rows].sort((a, b) => {
      const left = a.slot_no ?? Number.MAX_SAFE_INTEGER
      const right = b.slot_no ?? Number.MAX_SAFE_INTEGER
      return left - right
    })
  }, [scoreboardMap, selectedGameId])

  const statSlides = useMemo(
    () => buildStatSlides(participations, scoreboardMap, hero?.id || null),
    [participations, scoreboardMap, hero?.id],
  )

  const statPages = useMemo(() => {
    if (!statSlides.length) return []
    const pages = []
    for (let index = 0; index < statSlides.length; index += 6) {
      pages.push(statSlides.slice(index, index + 6))
    }
    return pages
  }, [statSlides])

  const statPagesLength = statPages.length

  useEffect(() => {
    if (!statPagesLength) {
      if (statPageIndex !== 0) setStatPageIndex(0)
      return
    }
    if (statPageIndex >= statPagesLength) {
      setStatPageIndex(statPagesLength - 1)
    }
  }, [statPageIndex, statPagesLength])

  const visibleStatSlides = statPagesLength
    ? statPages[Math.min(statPageIndex, statPagesLength - 1)]
    : statSlides

  const hasParticipations = Boolean(statSlides.length)

  const handleSelectGame = useCallback((gameId) => {
    setSelectedGameId(gameId || null)
  }, [])

  const handleSetStatPageIndex = useCallback(
    (index) => {
      if (!statPagesLength) {
        setStatPageIndex(0)
        return
      }
      const numeric = Number.isFinite(index) ? index : 0
      const clamped = Math.max(0, Math.min(statPagesLength - 1, numeric))
      setStatPageIndex(clamped)
    },
    [statPagesLength],
  )

  const handleUnsupportedAction = useCallback(() => {
    console.warn('Hero editing features are not available in this build.')
  }, [])

  const bgmLabel = useMemo(() => extractBgmLabel(hero?.bgm_url), [hero?.bgm_url])

  const profile = useMemo(
    () => ({
      status: { loading: status.loading, saving: false },
      hero,
      heroName,
      edit: hero,
      abilityCards,
      background: {
        preview: hero?.background_url || null,
        inputRef: backgroundInputRef,
        error: '',
      },
      bgm: {
        blob: null,
        label: bgmLabel,
        duration: hero?.bgm_duration_seconds || null,
        mime: hero?.bgm_mime || null,
        error: '',
        inputRef: bgmInputRef,
      },
      audio: {
        source: hero?.bgm_url || '',
        duration: hero?.bgm_duration_seconds || null,
      },
      actions: {
        changeEdit: handleUnsupportedAction,
        addAbility: handleUnsupportedAction,
        reverseAbilities: handleUnsupportedAction,
        clearAbility: handleUnsupportedAction,
        backgroundUpload: handleUnsupportedAction,
        backgroundClear: handleUnsupportedAction,
        bgmUpload: handleUnsupportedAction,
        bgmClear: handleUnsupportedAction,
        save: handleUnsupportedAction,
        remove: handleUnsupportedAction,
      },
      saving: false,
      reload: loadData,
    }),
    [
      abilityCards,
      bgmInputRef,
      bgmLabel,
      backgroundInputRef,
      handleUnsupportedAction,
      hero,
      heroName,
      loadData,
      status.loading,
    ],
  )

  const participation = useMemo(
    () => ({
      status: { loading: status.loading },
      participations,
      selectedEntry,
      selectedGame,
      selectedGameId,
      scoreboard: selectedScoreboard,
      statSlides,
      heroLookup,
      statsView: {
        pages: statPages,
        pageIndex: statPageIndex,
        visibleSlides: visibleStatSlides,
        hasParticipations,
        setPageIndex: handleSetStatPageIndex,
      },
      actions: {
        selectGame: handleSelectGame,
        refresh: loadData,
      },
    }),
    [
      handleSelectGame,
      handleSetStatPageIndex,
      hasParticipations,
      heroLookup,
      loadData,
      selectedEntry,
      selectedGame,
      selectedGameId,
      selectedScoreboard,
      statPageIndex,
      statPages,
      statSlides,
      status.loading,
      visibleStatSlides,
    ],
  )

  const battles = useMemo(
    () => ({
      summary: buildBattleSummary([]),
      details: [],
      visibleCount: 0,
      actions: { showMore: handleUnsupportedAction },
      status: { loading: false, error: '' },
    }),
    [handleUnsupportedAction],
  )

  const audioSource = hero?.bgm_url || ''
  const selectedScoreboardRows = selectedScoreboard

  return {
    status,
    heroName,
    profile,
    participation,
    battles,
    loading: status.loading,
    hero,
    edit: hero,
    saving: false,
    backgroundPreview: hero?.background_url || null,
    backgroundInputRef,
    backgroundError: '',
    bgmBlob: null,
    bgmLabel,
    bgmDuration: hero?.bgm_duration_seconds || null,
    bgmError: '',
    bgmInputRef,
    abilityCards,
    onChangeEdit: handleUnsupportedAction,
    onAddAbility: handleUnsupportedAction,
    onReverseAbilities: handleUnsupportedAction,
    onClearAbility: handleUnsupportedAction,
    onBackgroundUpload: handleUnsupportedAction,
    onClearBackground: handleUnsupportedAction,
    onBgmUpload: handleUnsupportedAction,
    onClearBgm: handleUnsupportedAction,
    onSave: handleUnsupportedAction,
    onDelete: handleUnsupportedAction,
    statSlides,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    heroLookup,
    statPages,
    statPageIndex,
    setStatPageIndex: handleSetStatPageIndex,
    visibleStatSlides,
    hasParticipations,
    onSelectGame: handleSelectGame,
    onShowMoreBattles: handleUnsupportedAction,
    battleSummary: battles.summary,
    battleDetails: battles.details,
    visibleBattles: battles.visibleCount,
    battleLoading: battles.status.loading,
    battleError: battles.status.error,
    audioSource,
    scoreboardRows: selectedScoreboardRows,
    reload: loadData,
  }
}
