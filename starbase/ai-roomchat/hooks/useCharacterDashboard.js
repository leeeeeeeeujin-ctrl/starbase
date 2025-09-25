import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../lib/supabase'
import { extractFileName, sanitizeFileName } from '../utils/characterAssets'
import {
  ABILITY_KEYS,
  buildAbilityCards,
  buildBattleSummary,
  buildStatSlides,
  includesHeroId,
} from '../utils/characterStats'

const LOGS_SLICE = 5

export default function useCharacterDashboard(heroId) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [hero, setHero] = useState(null)
  const [edit, setEdit] = useState({
    name: '',
    description: '',
    ability1: '',
    ability2: '',
    ability3: '',
    ability4: '',
    background_url: '',
    bgm_url: '',
  })
  const [saving, setSaving] = useState(false)

  const [participations, setParticipations] = useState([])
  const [gameDetails, setGameDetails] = useState({})
  const [scoreboards, setScoreboards] = useState({})
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [heroLookup, setHeroLookup] = useState({})

  const [battleDetails, setBattleDetails] = useState([])
  const [visibleBattles, setVisibleBattles] = useState(LOGS_SLICE)
  const [battleLoading, setBattleLoading] = useState(false)
  const [battleError, setBattleError] = useState('')

  const backgroundInputRef = useRef(null)
  const bgmInputRef = useRef(null)
  const [backgroundPreview, setBackgroundPreview] = useState(null)
  const [backgroundPreviewLocal, setBackgroundPreviewLocal] = useState(false)
  const [backgroundBlob, setBackgroundBlob] = useState(null)
  const [backgroundError, setBackgroundError] = useState('')

  const [bgmBlob, setBgmBlob] = useState(null)
  const [bgmLabel, setBgmLabel] = useState('')
  const [bgmDuration, setBgmDuration] = useState(null)
  const [bgmMime, setBgmMime] = useState(null)
  const [bgmError, setBgmError] = useState('')

  useEffect(() => {
    return () => {
      if (backgroundPreviewLocal && backgroundPreview) {
        URL.revokeObjectURL(backgroundPreview)
      }
    }
  }, [backgroundPreview, backgroundPreviewLocal])

  const loadParticipations = useCallback(
    async (targetHeroId, heroData) => {
      if (!targetHeroId) return

      const selectFields =
        'id, game_id, owner_id, hero_id, hero_ids, role, score, rating, battles, win_rate, created_at, updated_at'

      const [{ data: soloRows, error: soloErr }, { data: packRows, error: packErr }] = await Promise.all([
        supabase.from('rank_participants').select(selectFields).eq('hero_id', targetHeroId),
        supabase.from('rank_participants').select(selectFields).contains('hero_ids', [targetHeroId]),
      ])

      if (soloErr) console.warn('rank_participants hero_id fetch failed:', soloErr.message)
      if (packErr) console.warn('rank_participants hero_ids fetch failed:', packErr.message)

      const combined = [...(soloRows || []), ...(packRows || [])]
      const byGame = new Map()
      combined.forEach((row) => {
        if (!row?.game_id) return
        const key = `${row.game_id}:${row.owner_id}`
        if (!byGame.has(key)) {
          byGame.set(key, row)
        }
      })

      const rows = Array.from(byGame.values()).sort((a, b) => {
        const left = new Date(a.updated_at || a.created_at || 0)
        const right = new Date(b.updated_at || b.created_at || 0)
        return right - left
      })

      const gameIds = Array.from(new Set(rows.map((row) => row.game_id).filter(Boolean)))

      const [{ data: games, error: gameErr }, { data: boardRows, error: boardErr }] = await Promise.all([
        gameIds.length
          ? supabase
              .from('rank_games')
              .select('id, name, image_url, description, created_at')
              .in('id', gameIds)
          : { data: [], error: null },
        gameIds.length
          ? supabase
              .from('rank_participants')
              .select('id, game_id, owner_id, hero_id, hero_ids, role, rating, battles, score, updated_at')
              .in('game_id', gameIds)
          : { data: [], error: null },
      ])

      if (gameErr) console.warn('rank_games fetch failed:', gameErr.message)
      if (boardErr) console.warn('scoreboard fetch failed:', boardErr.message)

      const gameMap = {}
      ;(games || []).forEach((game) => {
        if (game?.id) gameMap[game.id] = game
      })

      const scoreboardMap = {}
      ;(boardRows || []).forEach((row) => {
        if (!row?.game_id) return
        if (!scoreboardMap[row.game_id]) scoreboardMap[row.game_id] = []
        scoreboardMap[row.game_id].push(row)
      })

      setParticipations(rows.map((row) => ({ ...row, game: gameMap[row.game_id] || null })))
      setGameDetails(gameMap)
      setScoreboards(scoreboardMap)

      const heroIds = new Set()
      Object.values(scoreboardMap).forEach((list) => {
        list.forEach((row) => {
          if (row?.hero_id) heroIds.add(row.hero_id)
          if (Array.isArray(row?.hero_ids)) {
            row.hero_ids.forEach((value) => heroIds.add(value))
          }
        })
      })
      heroIds.add(targetHeroId)

      const { data: heroRows, error: heroErr } = heroIds.size
        ? await supabase
            .from('heroes')
            .select('id, name, image_url, ability1, ability2, ability3, ability4')
            .in('id', Array.from(heroIds))
        : { data: [], error: null }

      if (heroErr) console.warn('heroes lookup fetch failed:', heroErr.message)

      const lookup = {}
      ;(heroRows || []).forEach((row) => {
        if (row?.id) lookup[row.id] = row
      })
      if (heroData?.id) {
        lookup[heroData.id] = {
          id: heroData.id,
          name: heroData.name,
          image_url: heroData.image_url,
          ability1: heroData.ability1,
          ability2: heroData.ability2,
          ability3: heroData.ability3,
          ability4: heroData.ability4,
        }
      }
      setHeroLookup(lookup)

      setSelectedGameId((current) => {
        if (current && rows.some((row) => row.game_id === current)) {
          return current
        }
        return rows[0]?.game_id || null
      })
    },
    [],
  )

  const loadHero = useCallback(async () => {
    if (!heroId) return
    setLoading(true)

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      router.replace('/')
      return
    }

    const { data, error } = await supabase
      .from('heroes')
      .select(
        'id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at',
      )
      .eq('id', heroId)
      .single()

    if (error || !data) {
      alert('캐릭터를 불러오지 못했습니다.')
      router.replace('/roster')
      return
    }

    setHero(data)
    setEdit({
      name: data.name || '',
      description: data.description || '',
      ability1: data.ability1 || '',
      ability2: data.ability2 || '',
      ability3: data.ability3 || '',
      ability4: data.ability4 || '',
      background_url: data.background_url || '',
      bgm_url: data.bgm_url || '',
    })
    setBackgroundPreview(data.background_url || null)
    setBackgroundPreviewLocal(false)
    setBackgroundBlob(null)
    setBackgroundError('')
    setBgmLabel(data.bgm_url ? extractFileName(data.bgm_url) : '')
    setBgmBlob(null)
    setBgmDuration(data.bgm_duration_seconds || null)
    setBgmMime(data.bgm_mime || null)
    setBgmError('')
    setLoading(false)
    await loadParticipations(data.id, data)
  }, [heroId, loadParticipations, router])

  useEffect(() => {
    ;(async () => {
      await loadHero()
    })()
  }, [loadHero])

  useEffect(() => {
    if (!hero?.id || !selectedGameId) {
      setBattleDetails([])
      setVisibleBattles(LOGS_SLICE)
      return
    }

    let active = true
    setBattleLoading(true)
    setBattleError('')

    ;(async () => {
      const fields = [
        'id',
        'game_id',
        'created_at',
        'result',
        'score_delta',
        'attacker_owner_id',
        'attacker_hero_ids',
        'defender_owner_id',
        'defender_hero_ids',
      ].join(', ')

      async function fetchByColumn(column) {
        const { data, error } = await supabase
          .from('rank_battles')
          .select(fields)
          .eq('game_id', selectedGameId)
          .contains(column, [hero.id])
          .order('created_at', { ascending: false })
          .limit(40)
        if (error) {
          console.warn('rank_battles contains fetch failed:', error.message)
          return []
        }
        return data || []
      }

      let attackRows = await fetchByColumn('attacker_hero_ids')
      let defendRows = await fetchByColumn('defender_hero_ids')

      if (!attackRows.length && !defendRows.length) {
        const { data, error } = await supabase
          .from('rank_battles')
          .select(fields)
          .eq('game_id', selectedGameId)
          .order('created_at', { ascending: false })
          .limit(40)
        if (error) {
          if (active) {
            setBattleError('전투 로그를 불러올 수 없습니다.')
            setBattleLoading(false)
          }
          return
        }
        const fallback = (data || []).filter(
          (row) => includesHeroId(row.attacker_hero_ids, hero.id) || includesHeroId(row.defender_hero_ids, hero.id),
        )
        attackRows = fallback
        defendRows = []
      }

      const merged = [...attackRows, ...defendRows]
      const byId = new Map()
      merged.forEach((row) => {
        if (row?.id) byId.set(row.id, row)
      })
      const battles = Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      )

      const ids = battles.map((battle) => battle.id)
      const { data: logRows, error: logError } = ids.length
        ? await supabase
            .from('rank_battle_logs')
            .select('battle_id, turn_no, prompt, ai_response, created_at')
            .in('battle_id', ids)
        : { data: [], error: null }

      if (logError) {
        console.warn('rank_battle_logs fetch failed:', logError.message)
      }

      const logsMap = new Map()
      ;(logRows || []).forEach((log) => {
        if (!log?.battle_id) return
        if (!logsMap.has(log.battle_id)) logsMap.set(log.battle_id, [])
        logsMap.get(log.battle_id).push(log)
      })

      const detailed = battles.map((battle) => ({
        ...battle,
        logs: (logsMap.get(battle.id) || []).sort((a, b) => (a.turn_no ?? 0) - (b.turn_no ?? 0)),
      }))

      if (!active) return
      setBattleDetails(detailed)
      setVisibleBattles(Math.min(LOGS_SLICE, detailed.length))
      setBattleLoading(false)
    })()

    return () => {
      active = false
    }
  }, [hero?.id, selectedGameId])

  const selectedEntry = useMemo(
    () => participations.find((row) => row.game_id === selectedGameId) || null,
    [participations, selectedGameId],
  )

  const selectedScoreboard = useMemo(() => {
    if (!selectedGameId) return []
    const rows = scoreboards[selectedGameId] || []
    return [...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }, [scoreboards, selectedGameId])

  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null
    const match = participations.find((row) => row.game_id === selectedGameId)
    if (match?.game) return match.game
    return gameDetails[selectedGameId] || null
  }, [gameDetails, participations, selectedGameId])

  const statSlides = useMemo(
    () => buildStatSlides(participations, scoreboards, hero?.id),
    [participations, scoreboards, hero?.id],
  )

  const battleSummary = useMemo(() => buildBattleSummary(battleDetails), [battleDetails])

  const abilityCards = useMemo(() => buildAbilityCards(edit), [edit])

  const handleChangeEdit = useCallback((key, value) => {
    setEdit((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSelectGame = useCallback((gameId) => {
    setSelectedGameId(gameId)
  }, [])

  const handleShowMoreBattles = useCallback(() => {
    setVisibleBattles((count) => Math.min(count + LOGS_SLICE, (battleDetails || []).length))
  }, [battleDetails])

  const handleAddAbility = useCallback(() => {
    const nextKey = ABILITY_KEYS.find((key) => !(edit[key] && edit[key].trim()))
    if (!nextKey) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
      return
    }
    setEdit((prev) => ({ ...prev }))
  }, [edit])

  const handleReverseAbilities = useCallback(() => {
    setEdit((prev) => {
      const values = ABILITY_KEYS.map((key) => prev[key] || '')
      const reversed = [...values].reverse()
      const next = { ...prev }
      ABILITY_KEYS.forEach((key, index) => {
        next[key] = reversed[index] || ''
      })
      return next
    })
  }, [])

  const handleClearAbility = useCallback((key) => {
    setEdit((prev) => ({ ...prev, [key]: '' }))
  }, [])

  const handleBackgroundUpload = useCallback(
    async (file) => {
      setBackgroundError('')
      if (!file) {
        setBackgroundBlob(null)
        if (backgroundPreviewLocal && backgroundPreview) {
          URL.revokeObjectURL(backgroundPreview)
        }
        setBackgroundPreview(null)
        setBackgroundPreviewLocal(false)
        return
      }
      if (!file.type.startsWith('image/')) {
        setBackgroundError('이미지 파일만 업로드할 수 있습니다.')
        return
      }
      if (file.size > 8 * 1024 * 1024) {
        setBackgroundError('이미지 크기는 8MB를 넘을 수 없습니다.')
        return
      }
      if (backgroundPreviewLocal && backgroundPreview) {
        URL.revokeObjectURL(backgroundPreview)
      }
      const blobFile = file.slice(0, file.size, file.type)
      const objectUrl = URL.createObjectURL(blobFile)
      setBackgroundBlob(blobFile)
      setBackgroundPreview(objectUrl)
      setBackgroundPreviewLocal(true)
      setEdit((prev) => ({ ...prev, background_url: '' }))
    },
    [backgroundPreview, backgroundPreviewLocal],
  )

  const handleClearBackground = useCallback(() => {
    if (backgroundPreviewLocal && backgroundPreview) {
      URL.revokeObjectURL(backgroundPreview)
    }
    setBackgroundBlob(null)
    setBackgroundPreview(null)
    setBackgroundPreviewLocal(false)
    setEdit((prev) => ({ ...prev, background_url: '' }))
    setBackgroundError('')
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = ''
    }
  }, [backgroundPreview, backgroundPreviewLocal])

  const handleBgmUpload = useCallback(
    async (file) => {
      setBgmError('')
      if (!file) {
        setBgmBlob(null)
        setBgmDuration(null)
        setBgmMime(null)
        setBgmLabel('')
        setEdit((prev) => ({ ...prev, bgm_url: '' }))
        return
      }
      if (!file.type.startsWith('audio/')) {
        setBgmError('오디오 파일만 업로드할 수 있습니다.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setBgmError('오디오 파일은 10MB를 넘을 수 없습니다.')
        return
      }
      const tempUrl = URL.createObjectURL(file)
      try {
        const duration = await new Promise((resolve, reject) => {
          const audio = document.createElement('audio')
          audio.preload = 'metadata'
          audio.onloadedmetadata = () => {
            if (!Number.isFinite(audio.duration)) {
              reject(new Error('재생 시간을 확인할 수 없습니다.'))
              return
            }
            resolve(audio.duration)
          }
          audio.onerror = () => reject(new Error('오디오 정보를 불러올 수 없습니다.'))
          audio.src = tempUrl
        })
        if (duration > 240) {
          setBgmError('BGM은 4분(240초)을 넘을 수 없습니다.')
          return
        }
        const buffer = await file.arrayBuffer()
        const blobFile = new Blob([new Uint8Array(buffer)], { type: file.type })
        setBgmBlob(blobFile)
        setBgmDuration(Math.round(duration))
        setBgmMime(file.type || null)
        setBgmLabel(file.name || '배경 음악')
        setEdit((prev) => ({ ...prev, bgm_url: '' }))
      } catch (error) {
        setBgmError(error.message || '오디오를 분석할 수 없습니다.')
      } finally {
        URL.revokeObjectURL(tempUrl)
      }
    },
    [],
  )

  const handleClearBgm = useCallback(() => {
    setBgmBlob(null)
    setBgmDuration(null)
    setBgmMime(null)
    setBgmLabel('')
    setBgmError('')
    setEdit((prev) => ({ ...prev, bgm_url: '' }))
    if (bgmInputRef.current) {
      bgmInputRef.current.value = ''
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      let backgroundUrl = edit.background_url || null
      if (backgroundBlob) {
        const extension = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg'
        const path = `hero-backgrounds/${Date.now()}-${sanitizeFileName(edit.name || hero?.name || 'background')}.${extension}`
        const { error: bgUploadError } = await supabase.storage
          .from('heroes')
          .upload(path, backgroundBlob, {
            upsert: true,
            contentType: backgroundBlob.type || 'image/jpeg',
          })
        if (bgUploadError) throw bgUploadError
        backgroundUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
      }

      let bgmUrl = edit.bgm_url || null
      let bgmDurationSeconds = bgmDuration != null ? bgmDuration : hero?.bgm_duration_seconds || null
      let bgmMimeValue = bgmMime || hero?.bgm_mime || null
      if (bgmBlob) {
        const extension = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3'
        const path = `hero-bgm/${Date.now()}-${sanitizeFileName(edit.name || hero?.name || 'bgm')}.${extension}`
        const { error: bgmUploadError } = await supabase.storage
          .from('heroes')
          .upload(path, bgmBlob, { upsert: true, contentType: bgmBlob.type || 'audio/mpeg' })
        if (bgmUploadError) throw bgmUploadError
        bgmUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
        bgmDurationSeconds = bgmDuration != null ? bgmDuration : bgmDurationSeconds
        bgmMimeValue = bgmMime || bgmBlob.type || bgmMimeValue
      }
      if (!bgmUrl) {
        bgmDurationSeconds = null
        bgmMimeValue = null
      }

      const payload = {
        name: edit.name,
        description: edit.description,
        ability1: edit.ability1,
        ability2: edit.ability2,
        ability3: edit.ability3,
        ability4: edit.ability4,
        background_url: backgroundUrl,
        bgm_url: bgmUrl,
        bgm_duration_seconds: bgmDurationSeconds,
        bgm_mime: bgmMimeValue,
      }
      const { error } = await supabase.from('heroes').update(payload).eq('id', heroId)
      if (error) throw error
      setHero((prev) => (prev ? { ...prev, ...payload } : prev))
      setEdit((prev) => ({
        ...prev,
        background_url: backgroundUrl || '',
        bgm_url: bgmUrl || '',
      }))
      if (backgroundBlob) {
        setBackgroundBlob(null)
        setBackgroundPreview(backgroundUrl || null)
        setBackgroundPreviewLocal(false)
      }
      if (!backgroundUrl) {
        if (backgroundPreviewLocal && backgroundPreview) {
          URL.revokeObjectURL(backgroundPreview)
        }
        setBackgroundPreview(null)
        setBackgroundPreviewLocal(false)
      }
      if (bgmBlob) {
        setBgmBlob(null)
      }
      setBgmLabel(bgmUrl ? extractFileName(bgmUrl) : '')
      setBgmDuration(bgmDurationSeconds)
      setBgmMime(bgmMimeValue)
      alert('저장 완료')
    } catch (error) {
      alert(error.message || error)
    } finally {
      setSaving(false)
    }
  }, [backgroundBlob, backgroundPreview, backgroundPreviewLocal, bgmBlob, bgmDuration, bgmMime, edit, hero?.name, hero?.bgm_duration_seconds, hero?.bgm_mime, heroId])

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return
    const { error } = await supabase.from('heroes').delete().eq('id', heroId)
    if (error) {
      alert(error.message)
      return
    }
    router.replace('/roster')
  }, [heroId, router])

  return {
    loading,
    hero,
    edit,
    saving,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    statSlides,
    heroLookup,
    battleSummary,
    battleDetails,
    visibleBattles,
    battleLoading,
    battleError,
    backgroundPreview,
    backgroundInputRef,
    backgroundError,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmError,
    bgmInputRef,
    abilityCards,
    onChangeEdit: handleChangeEdit,
    onSelectGame: handleSelectGame,
    onShowMoreBattles: handleShowMoreBattles,
    onAddAbility: handleAddAbility,
    onReverseAbilities: handleReverseAbilities,
    onClearAbility: handleClearAbility,
    onBackgroundUpload: handleBackgroundUpload,
    onClearBackground: handleClearBackground,
    onBgmUpload: handleBgmUpload,
    onClearBgm: handleClearBgm,
    onSave: handleSave,
    onDelete: handleDelete,
  }
}

//
