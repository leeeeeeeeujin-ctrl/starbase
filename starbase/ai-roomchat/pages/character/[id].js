// pages/character/[id].js
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'

const LOGS_SLICE = 5
const ABILITY_KEYS = ['ability1', 'ability2', 'ability3', 'ability4']

function sanitizeFileName(base, fallback = 'asset') {
  const safe = String(base || fallback)
    .normalize('NFKD')
    .replace(/[^\w\d-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || fallback
}

function extractFileName(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    const last = parts[parts.length - 1]
    return last || url
  } catch (error) {
    const pieces = String(url).split('/')
    return pieces[pieces.length - 1] || url
  }
}

export default function CharacterDetail() {
  const router = useRouter()
  const { id } = router.query

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
  const [battleDetails, setBattleDetails] = useState([])
  const [visibleBattles, setVisibleBattles] = useState(LOGS_SLICE)
  const [battleLoading, setBattleLoading] = useState(false)
  const [battleError, setBattleError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [heroLookup, setHeroLookup] = useState({})

  const [startModalOpen, setStartModalOpen] = useState(false)
  const [startStep, setStartStep] = useState('preview')
  const [matchProgress, setMatchProgress] = useState(0)
  const backgroundInputRef = useRef(null)
  const bgmInputRef = useRef(null)
  const [backgroundPreview, setBackgroundPreview] = useState(null)
  const [backgroundPreviewLocal, setBackgroundPreviewLocal] = useState(false)
  const [backgroundBlob, setBackgroundBlob] = useState(null)
  const [backgroundError, setBackgroundError] = useState('')
  const [bgmLabel, setBgmLabel] = useState('')
  const [bgmBlob, setBgmBlob] = useState(null)
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

  useEffect(() => {
    if (!id) return
    let mounted = true

    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!mounted) return
      if (!auth?.user) {
        router.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('heroes')
        .select('id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at')
        .eq('id', id)
        .single()

      if (!mounted) return

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
      await loadParticipations(data.id)
    })()

    return () => {
      mounted = false
    }
  }, [id, router])

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
          }
          return
        }
        const fallback = (data || []).filter(
          (row) => includesHero(row.attacker_hero_ids, hero.id) || includesHero(row.defender_hero_ids, hero.id),
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

  const heroId = hero?.id

  const statSlides = useMemo(() => {
    if (!participations.length) return []

    return participations.map((row) => {
      const board = scoreboards[row.game_id] || []
      const sortedBoard = board.length ? [...board].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) : []
      const heroIndex = heroId ? sortedBoard.findIndex((item) => item.hero_id === heroId) : -1
      const rankText = heroIndex >= 0 ? `#${heroIndex + 1}` : '—'
      const ratingValue = row.rating ?? row.score
      const ratingText =
        typeof ratingValue === 'number' ? ratingValue.toLocaleString() : ratingValue || '—'
      const totalBattles = row.battles ?? 0
      let winRateText = '—'
      if (row.win_rate != null) {
        const rate = Math.round(row.win_rate)
        winRateText = `${Math.max(0, Math.min(100, rate))}%`
      } else if (totalBattles && typeof row.score === 'number') {
        const computed = Math.round((row.score / totalBattles) * 100)
        if (Number.isFinite(computed)) {
          winRateText = `${Math.max(0, Math.min(100, computed))}%`
        }
      }
      const battlesText = totalBattles ? totalBattles.toLocaleString() : '0'

      return {
        key: row.game_id,
        name: row.game?.name || '이름 없는 게임',
        image: row.game?.image_url || null,
        role: row.role || '',
        stats: [
          { key: 'rank', label: '전체 랭킹', value: rankText },
          { key: 'rating', label: 'Elo Score', value: ratingText },
          { key: 'winRate', label: '승률', value: winRateText },
          { key: 'battles', label: '전체 전투수', value: battlesText },
        ],
      }
    })
  }, [heroId, participations, scoreboards])

  const battleSummary = useMemo(() => {
    const wins = battleDetails.filter((battle) => (battle.result || '').toLowerCase() === 'win').length
    const losses = battleDetails.filter((battle) => {
      const value = (battle.result || '').toLowerCase()
      return value === 'lose' || value === 'loss'
    }).length
    const draws = battleDetails.filter((battle) => (battle.result || '').toLowerCase() === 'draw').length
    const total = battleDetails.length
    const rate = total ? Math.round((wins / total) * 100) : null
    return { wins, losses, draws, total, rate }
  }, [battleDetails])

  const abilityCards = useMemo(
    () =>
      ABILITY_KEYS.map((key, index) => ({
        key,
        label: `능력 ${index + 1}`,
        value: edit[key] || '',
      })),
    [edit],
  )

  const scoreboardPreview = useMemo(() => selectedScoreboard.slice(0, 8), [selectedScoreboard])

  const opponentCards = useMemo(() => {
    if (!selectedGameId) return []
    return selectedScoreboard
      .filter((row) => {
        if (heroId && row?.hero_id === heroId) return false
        if (Array.isArray(row?.hero_ids) && heroId && row.hero_ids.includes(heroId)) return false
        return true
      })
      .map((row) => {
        const heroEntry = heroLookup[row.hero_id] || null
        const name = heroEntry?.name || row.role || '참가자'
        const portrait = heroEntry?.image_url || null
        const abilities = heroEntry
          ? ABILITY_KEYS.map((key) => heroEntry[key]).filter(Boolean).slice(0, 2)
          : []
        return {
          id: row.id || `${row.hero_id}-${row.owner_id}`,
          heroId: row.hero_id || null,
          role: row.role || '',
          name,
          portrait,
          abilities,
        }
      })
  }, [selectedGameId, selectedScoreboard, heroLookup, heroId])

  useEffect(() => {
    if (!startModalOpen || startStep !== 'matching') return
    setMatchProgress(0)
    let cancelled = false
    const timer = setInterval(() => {
      setMatchProgress((prev) => {
        if (cancelled) return prev
        if (prev >= 100) return prev
        const next = Math.min(100, prev + 8)
        if (next === 100) {
          setTimeout(() => {
            if (!cancelled) setStartStep('ready')
          }, 350)
        }
        return next
      })
    }, 280)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [startModalOpen, startStep])

  async function loadParticipations(heroId) {
    const selectFields =
      'id, game_id, owner_id, hero_id, hero_ids, role, score, rating, battles, created_at, updated_at'

    const [{ data: soloRows, error: soloErr }, { data: packRows, error: packErr }] = await Promise.all([
      supabase.from('rank_participants').select(selectFields).eq('hero_id', heroId),
      supabase.from('rank_participants').select(selectFields).contains('hero_ids', [heroId]),
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
            .select('id, game_id, owner_id, hero_id, role, rating, battles, score, updated_at')
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
          row.hero_ids.forEach((hid) => heroIds.add(hid))
        }
      })
    })
    if (heroId) heroIds.add(heroId)
    const missingHeroIds = Array.from(heroIds).filter((hid) => hid && !heroLookup[hid])
    if (missingHeroIds.length) {
      const { data: heroRows, error: heroErr } = await supabase
        .from('heroes')
        .select('id, name, image_url, description, ability1, ability2, ability3, ability4')
        .in('id', missingHeroIds)
      if (heroErr) {
        console.warn('hero lookup fetch failed:', heroErr.message)
      } else {
        const map = {}
        ;(heroRows || []).forEach((row) => {
          if (row?.id) map[row.id] = row
        })
        if (Object.keys(map).length) {
          setHeroLookup((prev) => ({ ...prev, ...map }))
        }
      }
    }

    if (!rows.length) {
      setSelectedGameId(null)
    } else if (!rows.find((row) => row.game_id === selectedGameId)) {
      setSelectedGameId(rows[0].game_id)
    }
  }
  // [계속: 2/3에서부터 업로드/저장 핸들러 등 이어짐]
  async function handleBackgroundUpload(file) {
    setBackgroundError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setBackgroundError('이미지 파일만 선택할 수 있습니다.')
      return
    }
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
      setBackgroundError('움짤(GIF)은 배경으로 사용할 수 없습니다.')
      return
    }
    const buffer = await file.arrayBuffer()
    const blobFile = new Blob([new Uint8Array(buffer)], { type: file.type })
    if (backgroundPreviewLocal && backgroundPreview) {
      URL.revokeObjectURL(backgroundPreview)
    }
    const url = URL.createObjectURL(blobFile)
    setBackgroundBlob(blobFile)
    setBackgroundPreview(url)
    setBackgroundPreviewLocal(true)
    setEdit((prev) => ({ ...prev, background_url: '' }))
  }

  async function handleBgmUpload(file) {
    setBgmError('')
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setBgmError('오디오 파일만 선택할 수 있습니다.')
      return
    }
    if (/wav/i.test(file.type) || /\.wav$/i.test(file.name || '')) {
      setBgmError('WAV 형식은 지원되지 않습니다.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setBgmError('파일 크기가 너무 큽니다. 15MB 이하로 업로드하세요.')
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
  }

  function clearBackgroundAsset() {
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
  }

  function clearBgmAsset() {
    setBgmBlob(null)
    setBgmDuration(null)
    setBgmMime(null)
    setBgmLabel('')
    setBgmError('')
    setEdit((prev) => ({ ...prev, bgm_url: '' }))
    if (bgmInputRef.current) {
      bgmInputRef.current.value = ''
    }
  }

  async function save() {
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
      const { error } = await supabase.from('heroes').update(payload).eq('id', id)
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
  }

  async function remove() {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return
    const { error } = await supabase.from('heroes').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    router.replace('/roster')
  }

  function addAbilitySlot() {
    setActiveTab('abilities')
    const nextKey = ABILITY_KEYS.find((key) => !(edit[key] && edit[key].trim()))
    if (!nextKey) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
      return
    }
    setEdit((prev) => ({ ...prev }))
  }

  function reverseAbilities() {
    setActiveTab('abilities')
    setEdit((prev) => {
      const values = ABILITY_KEYS.map((key) => prev[key] || '')
      const reversed = [...values].reverse()
      const next = { ...prev }
      ABILITY_KEYS.forEach((key, index) => {
        next[key] = reversed[index] || ''
      })
      return next
    })
  }

  function clearAbility(key) {
    setActiveTab('abilities')
    setEdit((prev) => ({ ...prev, [key]: '' }))
  }

  function showMoreBattles() {
    setVisibleBattles((count) => Math.min(count + LOGS_SLICE, battleDetails.length))
  }

  if (loading) {
    return <div style={{ padding: 20, color: '#0f172a' }}>불러오는 중…</div>
  }

  if (!hero) {
    return null
  }

  const hasParticipations = statSlides.length > 0

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, rgba(15, 118, 110, 0.28), rgba(2, 6, 23, 0.95) 65%)',
        color: '#e2e8f0',
        position: 'relative',
      }}
    >
      <div
        style={{
          maxWidth: 1024,
          margin: '0 auto',
          padding: '32px 16px 160px',
          display: 'grid',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.75)',
              color: '#f1f5f9',
              fontWeight: 600,
            }}
          >
            ← 로스터로
          </button>
          <div style={{ flex: '1 1 220px', minWidth: 220 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>캐릭터 프로필</span>
            <h1 style={{ margin: '6px 0 0', fontSize: 30 }}>{edit.name || '이름 없는 캐릭터'}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: 'none',
                background: saving ? 'rgba(56, 189, 248, 0.35)' : '#38bdf8',
                color: '#020617',
                fontWeight: 800,
                minWidth: 120,
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              onClick={remove}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid rgba(248, 113, 113, 0.35)',
                background: 'rgba(248, 113, 113, 0.15)',
                color: '#fca5a5',
                fontWeight: 700,
              }}
            >
              삭제
            </button>
          </div>
        </header>

        <section style={{ display: 'grid', gap: 20 }}>
          <div
            style={{
              borderRadius: 32,
              border: '1px solid rgba(56, 189, 248, 0.4)',
              background: 'linear-gradient(180deg, rgba(15, 118, 110, 0.4) 0%, rgba(15, 23, 42, 0.9) 100%)',
              padding: 24,
              boxShadow: '0 40px 80px -50px rgba(56, 189, 248, 0.6)',
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 28,
                overflow: 'hidden',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              {hero.image_url ? (
                <img
                  src={hero.image_url}
                  alt={hero.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    fontWeight: 700,
                  }}
                >
                  이미지 없음
                </div>
              )}
            </div>
          </div>

          {hasParticipations ? (
            <div
              style={{
                display: 'flex',
                gap: 18,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollSnapType: 'x mandatory',
              }}
            >
              {statSlides.map((slide) => {
                const active = slide.key === selectedGameId
                return (
                  <button
                    key={slide.key}
                    type="button"
                    onClick={() => setSelectedGameId(slide.key)}
                    style={{
                      scrollSnapAlign: 'center',
                      minWidth: '82%',
                      maxWidth: '82%',
                      borderRadius: 28,
                      padding: 22,
                      border: active ? '1px solid rgba(56, 189, 248, 0.65)' : '1px solid rgba(148, 163, 184, 0.25)',
                      background: active
                        ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.45) 0%, rgba(15, 23, 42, 0.92) 100%)'
                        : 'rgba(15, 23, 42, 0.72)',
                      color: '#f1f5f9',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 16,
                      boxShadow: active ? '0 30px 80px -40px rgba(56, 189, 248, 0.85)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 18,
                          overflow: 'hidden',
                          border: '1px solid rgba(148, 163, 184, 0.35)',
                          background: 'rgba(15, 23, 42, 0.75)',
                          flexShrink: 0,
                        }}
                      >
                        {slide.image ? (
                          <img
                            src={slide.image}
                            alt={slide.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#38bdf8',
                              fontWeight: 700,
                            }}
                          >
                            Game
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <strong style={{ fontSize: 18, lineHeight: 1.3 }}>{slide.name}</strong>
                        <span style={{ fontSize: 13, color: '#bae6fd' }}>
                          {slide.role ? `${slide.role} 역할` : '참여 기록'}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {slide.stats.map((stat) => (
                        <div
                          key={stat.key}
                          style={{
                            borderRadius: 20,
                            padding: '16px 18px',
                            background: active
                              ? 'rgba(8, 47, 73, 0.9)'
                              : 'linear-gradient(180deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.85) 100%)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            display: 'grid',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 13, color: '#94a3b8' }}>{stat.label}</span>
                          <strong style={{ fontSize: 22 }}>{stat.value}</strong>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div
              style={{
                borderRadius: 24,
                border: '1px dashed rgba(148, 163, 184, 0.35)',
                padding: 24,
                textAlign: 'center',
                color: '#94a3b8',
                background: 'rgba(15, 23, 42, 0.6)',
              }}
            >
              아직 참여한 게임이 없습니다.
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!selectedGameId && participations[0]) {
                setSelectedGameId(participations[0].game_id)
              }
              if (!selectedGameId && !participations.length) {
                alert('먼저 게임에 참여한 뒤 배틀을 시작할 수 있습니다.')
                return
              }
              setStartStep('preview')
              setMatchProgress(0)
              setStartModalOpen(true)
            }}
            disabled={!participations.length}
            style={{
              marginTop: 16,
              padding: '16px 24px',
              borderRadius: 28,
              border: '1px solid rgba(56, 189, 248, 0.65)',
              background: participations.length ? 'rgba(14, 165, 233, 0.2)' : 'rgba(51, 65, 85, 0.65)',
              color: participations.length ? '#e0f2fe' : '#94a3b8',
              fontWeight: 800,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <span role="img" aria-label="battle">⚔️</span>
            배틀 시작
          </button>
        </section>

        <section
          style={{
            borderRadius: 28,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.72)',
            padding: 24,
            display: 'grid',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { key: 'overview', label: '소개' },
              { key: 'abilities', label: '능력' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: activeTab === tab.key ? 'none' : '1px solid rgba(148, 163, 184, 0.3)',
                  background: activeTab === tab.key ? '#38bdf8' : 'rgba(15, 23, 42, 0.65)',
                  color: activeTab === tab.key ? '#020617' : '#e2e8f0',
                  fontWeight: 700,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>캐릭터 이름</span>
                <input
                  value={edit.name}
                  onChange={(event) => setEdit((state) => ({ ...state, name: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>설명</span>
                <textarea
                  value={edit.description}
                  onChange={(event) => setEdit((state) => ({ ...state, description: event.target.value }))}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 160 }}
                  placeholder="캐릭터의 배경과 개성을 소개해 주세요."
                />
              </label>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  borderRadius: 24,
                  padding: 18,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.6)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>배경 이미지</div>
                <div
                  style={{
                    width: '100%',
                    minHeight: 140,
                    borderRadius: 16,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                    background: 'rgba(15, 23, 42, 0.45)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {backgroundPreview ? (
                    <img
                      src={backgroundPreview}
                      alt="배경 미리보기"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>등록된 배경이 없습니다.</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => backgroundInputRef.current?.click()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: '#38bdf8',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    배경 업로드
                  </button>
                  <button
                    type="button"
                    onClick={clearBackgroundAsset}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.25)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    배경 제거
                  </button>
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleBackgroundUpload(event.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                {backgroundError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{backgroundError}</div>}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  borderRadius: 24,
                  padding: 18,
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  background: 'rgba(15, 23, 42, 0.6)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>배경 음악</div>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {bgmLabel || (edit.bgm_url ? extractFileName(edit.bgm_url) : '등록된 BGM이 없습니다.')}
                </div>
                {bgmDuration != null && (
                  <div style={{ fontSize: 12, color: '#38bdf8' }}>재생 시간: {bgmDuration}초</div>
                )}
                <div style={{ fontSize: 12, color: '#cbd5f5' }}>
                  MP3 등 스트리밍형 오디오만 지원하며 WAV 형식과 4분을 초과하는 곡은 사용할 수 없습니다.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => bgmInputRef.current?.click()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: '#fb7185',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    음악 업로드
                  </button>
                  <button
                    type="button"
                    onClick={clearBgmAsset}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.25)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    음악 제거
                  </button>
                </div>
                <input
                  ref={bgmInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(event) => handleBgmUpload(event.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                {bgmError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{bgmError}</div>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {abilityCards.map((ability, index) => (
                <div
                  key={ability.key}
                  style={{
                    borderRadius: 24,
                    padding: 18,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    background: 'linear-gradient(180deg, rgba(30, 64, 175, 0.28) 0%, rgba(15, 23, 42, 0.92) 100%)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>능력 {index + 1}</span>
                    {ability.value ? (
                      <button
                        type="button"
                        onClick={() => clearAbility(ability.key)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 999,
                          border: '1px solid rgba(248, 113, 113, 0.4)',
                          background: 'rgba(248, 113, 113, 0.16)',
                          color: '#fecaca',
                          fontWeight: 600,
                        }}
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={ability.value}
                    onChange={(event) =>
                      setEdit((state) => ({ ...state, [ability.key]: event.target.value }))
                    }
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
                    placeholder="능력 설명을 입력하세요."
                  />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={addAbilitySlot}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 999,
                    border: '1px solid rgba(56, 189, 248, 0.55)',
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    fontWeight: 700,
                  }}
                >
                  능력 생성
                </button>
                <button
                  type="button"
                  onClick={reverseAbilities}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: 'rgba(15, 23, 42, 0.65)',
                    color: '#e2e8f0',
                    fontWeight: 700,
                  }}
                >
                  능력 순서 수정
                </button>
              </div>
            </div>
          )}
        </section>
        {hasParticipations ? (
          <section
            style={{
              borderRadius: 28,
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15, 23, 42, 0.72)',
              padding: 24,
              display: 'grid',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>점수판</h2>
              {selectedGame ? (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>{selectedGame.name}</span>
              ) : null}
            </div>
            {scoreboardPreview.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {scoreboardPreview.map((row, index) => {
                  const highlight = row.hero_id === heroId
                  const displayName = heroLookup[row.hero_id]?.name || row.role || `참가자 ${index + 1}`
                  return (
                    <div
                      key={row.id || `${row.hero_id}-${index}`}
                      style={{
                        borderRadius: 18,
                        padding: '12px 16px',
                        background: highlight ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.65)',
                        border: highlight ? '1px solid rgba(56, 189, 248, 0.55)' : '1px solid rgba(148, 163, 184, 0.2)',
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 14,
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: '50%',
                          background: 'rgba(8, 47, 73, 0.8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          fontWeight: 700,
                        }}
                      >
                        #{index + 1}
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>{displayName}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{row.role || '—'}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>참여 {row.battles ?? 0}회</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {row.rating ?? row.score ?? '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: '#94a3b8',
                  borderRadius: 18,
                  border: '1px dashed rgba(148, 163, 184, 0.35)',
                }}
              >
                선택한 게임의 점수판이 없습니다.
              </div>
            )}
          </section>
        ) : null}

        <section
          style={{
            borderRadius: 28,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.78)',
            padding: 24,
            display: 'grid',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>게임별 베틀로그</h2>
            {battleSummary.total ? (
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                {battleSummary.wins}승 {battleSummary.draws}무 {battleSummary.losses}패
              </span>
            ) : null}
          </div>

          {hasParticipations && statSlides.length > 1 ? (
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {statSlides.map((slide) => {
                const active = slide.key === selectedGameId
                return (
                  <button
                    key={`${slide.key}-selector`}
                    type="button"
                    onClick={() => setSelectedGameId(slide.key)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 16,
                      border: active ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(148, 163, 184, 0.25)',
                      background: active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.65)',
                      color: '#f1f5f9',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {slide.name}
                  </button>
                )
              })}
            </div>
          ) : null}

          {battleLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>
          ) : battleDetails.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: '#94a3b8',
                borderRadius: 20,
                border: '1px dashed rgba(148, 163, 184, 0.3)',
              }}
            >
              {selectedGame ? `${selectedGame.name}에서의 전투 기록이 없습니다.` : '전투 기록이 없습니다.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {battleDetails.slice(0, visibleBattles).map((battle) => {
                const resultStyle = getResultStyles(battle.result)
                const latestResponse = [...(battle.logs || [])]
                  .reverse()
                  .find((log) => log.ai_response)?.ai_response
                const summary = latestResponse || battle.logs?.[0]?.prompt || ''

                return (
                  <article
                    key={battle.id}
                    style={{
                      borderRadius: 24,
                      padding: 18,
                      background: resultStyle.background,
                      border: resultStyle.border,
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 13, color: '#cbd5f5' }}>{formatDate(battle.created_at)}</span>
                        {selectedGame ? (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{selectedGame.name}</span>
                        ) : null}
                      </div>
                      <span
                        style={{
                          fontWeight: 800,
                          color: resultStyle.color,
                          fontSize: 16,
                        }}
                      >
                        {resultStyle.label}
                      </span>
                    </div>
                    <div
                      style={{
                        borderRadius: 18,
                        padding: '14px 16px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        color: '#e2e8f0',
                        fontSize: 14,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {summary ? truncateText(summary, 320) : '대화 로그가 없습니다.'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                        color: '#cbd5f5',
                      }}
                    >
                      <span>점수 변화 {battle.score_delta ?? 0}</span>
                      <span>턴 {battle.logs?.length ?? 0}</span>
                    </div>
                  </article>
                )
              })}

              {battleDetails.length > visibleBattles ? (
                <button
                  type="button"
                  onClick={showMoreBattles}
                  style={{
                    justifySelf: 'center',
                    padding: '10px 20px',
                    borderRadius: 999,
                    border: '1px solid rgba(56, 189, 248, 0.55)',
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    fontWeight: 700,
                  }}
                >
                  더 보기
                </button>
              ) : null}
            </div>
          )}

          {battleError && <div style={{ color: '#f87171', fontSize: 12 }}>{battleError}</div>}
        </section>
      </div>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: '100%',
          background: 'rgba(2, 6, 23, 0.95)',
          borderTop: '1px solid rgba(148, 163, 184, 0.2)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          backdropFilter: 'blur(6px)',
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            padding: '10px 18px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'rgba(15, 23, 42, 0.8)',
            color: '#e2e8f0',
            fontWeight: 600,
          }}
        >
          ← 뒤로가기
        </button>
        <button
          onClick={() => router.push(`/lobby?heroId=${hero.id}`)}
          style={{
            padding: '10px 24px',
            borderRadius: 999,
            border: 'none',
            background: '#38bdf8',
            color: '#020617',
            fontWeight: 800,
          }}
        >
          로비로 이동
        </button>
      </footer>

      {startModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
            zIndex: 1200,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 640,
              borderRadius: 28,
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'linear-gradient(180deg, rgba(15, 118, 110, 0.38) 0%, rgba(2, 6, 23, 0.94) 100%)',
              color: '#e2e8f0',
              padding: '28px 24px',
              display: 'grid',
              gap: 20,
              boxShadow: '0 50px 120px -60px rgba(56, 189, 248, 0.85)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24 }}>
                  {startStep === 'preview'
                    ? '매칭 준비'
                    : startStep === 'matching'
                    ? '참가자 매칭 중'
                    : '모두 준비 완료'}
                </h2>
                {selectedGame ? (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#bae6fd' }}>{selectedGame.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartModalOpen(false)
                  setStartStep('preview')
                  setMatchProgress(0)
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#e2e8f0',
                  fontWeight: 600,
                }}
              >
                닫기
              </button>
            </div>

            {startStep === 'preview' ? (
              <>
                <div
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    background: 'rgba(15, 23, 42, 0.75)',
                    padding: 18,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 24,
                        overflow: 'hidden',
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        background: 'rgba(2, 6, 23, 0.9)',
                        flexShrink: 0,
                      }}
                    >
                      {hero.image_url ? (
                        <img
                          src={hero.image_url}
                          alt={hero.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#38bdf8',
                            fontWeight: 700,
                          }}
                        >
                          YOU
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 20 }}>{hero.name || '이름 없는 캐릭터'}</strong>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>
                        {selectedEntry?.role ? `${selectedEntry.role} 역할` : '참여자'}
                      </span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.6 }}>
                    선택한 게임에서 함께 싸울 다른 참가자들을 확인하세요. 능력과 역할을 검토한 뒤 다시 한번
                    &ldquo;게임 시작&rdquo;을 눌러 매칭을 진행합니다.
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  {opponentCards.length ? (
                    opponentCards.map((opponent) => (
                      <div
                        key={opponent.id}
                        style={{
                          borderRadius: 20,
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                          background: 'rgba(15, 23, 42, 0.7)',
                          padding: 16,
                          display: 'grid',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div
                            style={{
                              width: 60,
                              height: 60,
                              borderRadius: 18,
                              overflow: 'hidden',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              background: 'rgba(15, 23, 42, 0.9)',
                              flexShrink: 0,
                            }}
                          >
                            {opponent.portrait ? (
                              <img
                                src={opponent.portrait}
                                alt={opponent.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#38bdf8',
                                  fontWeight: 700,
                                }}
                              >
                                VS
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <strong style={{ fontSize: 18 }}>{opponent.name}</strong>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                              {opponent.role ? `${opponent.role} 역할` : '참가자'}
                            </span>
                          </div>
                        </div>
                        {opponent.abilities.length ? (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {opponent.abilities.map((ability, index) => (
                              <div
                                key={`${opponent.id}-ability-${index}`}
                                style={{
                                  borderRadius: 14,
                                  border: '1px solid rgba(56, 189, 248, 0.25)',
                                  background: 'rgba(8, 47, 73, 0.65)',
                                  padding: '10px 12px',
                                  fontSize: 13,
                                  color: '#e0f2fe',
                                  lineHeight: 1.6,
                                }}
                              >
                                {ability}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        borderRadius: 20,
                        border: '1px dashed rgba(148, 163, 184, 0.3)',
                        background: 'rgba(15, 23, 42, 0.65)',
                        padding: 20,
                        textAlign: 'center',
                        color: '#94a3b8',
                      }}
                    >
                      아직 다른 참가자가 없습니다. 잠시 후 다시 시도하거나 게임 로비에서 새 전투를 만들어 보세요.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartModalOpen(false)
                      setStartStep('preview')
                      setMatchProgress(0)
                    }}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      background: 'rgba(15, 23, 42, 0.7)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedGameId) {
                        alert('먼저 게임을 선택하세요.')
                        return
                      }
                      setStartStep('matching')
                    }}
                    style={{
                      padding: '12px 22px',
                      borderRadius: 999,
                      border: 'none',
                      background: '#38bdf8',
                      color: '#020617',
                      fontWeight: 800,
                    }}
                  >
                    게임 시작
                  </button>
                </div>
              </>
            ) : null}

            {startStep === 'matching' ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <div
                  style={{
                    borderRadius: 20,
                    padding: 18,
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    background: 'rgba(8, 47, 73, 0.7)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <strong style={{ fontSize: 18 }}>상대 준비 중…</strong>
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.6 }}>
                    참가자들의 전투 준비 상태를 확인하는 중입니다. 모두 준비되면 자동으로 전투 대기 화면으로
                    이동합니다.
                  </p>
                  <div
                    style={{
                      height: 12,
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${matchProgress}%`,
                        background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.9), rgba(59, 130, 246, 0.9))',
                        transition: 'width 0.28s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: '#bae6fd', textAlign: 'right' }}>{matchProgress}%</span>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {[hero, ...opponentCards].map((entry, index) => {
                    const isSelf = index === 0
                    const readyThreshold = isSelf ? 20 : 60 + index * 10
                    const ready = matchProgress >= Math.min(readyThreshold, 95)
                    const portrait = isSelf ? hero.image_url : entry?.portrait
                    const displayName = isSelf
                      ? hero.name || '이름 없는 캐릭터'
                      : entry?.name || `참가자 ${index}`
                    return (
                      <div
                        key={isSelf ? hero.id : entry?.id || index}
                        style={{
                          borderRadius: 18,
                          border: '1px solid rgba(148, 163, 184, 0.25)',
                          background: 'rgba(15, 23, 42, 0.7)',
                          padding: 14,
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: 16,
                              overflow: 'hidden',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              background: 'rgba(2, 6, 23, 0.9)',
                            }}
                          >
                            {portrait ? (
                              <img
                                src={portrait}
                                alt={displayName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#38bdf8',
                                  fontWeight: 700,
                                }}
                              >
                                {isSelf ? 'YOU' : 'VS'}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <strong style={{ fontSize: 16 }}>{displayName}</strong>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                              {isSelf ? '내 캐릭터' : entry?.role ? `${entry.role} 역할` : '상대방'}
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            color: ready ? '#4ade80' : '#94a3b8',
                            fontWeight: 700,
                          }}
                        >
                          {ready ? '준비 완료' : '대기 중…'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {startStep === 'ready' ? (
              <div style={{ display: 'grid', gap: 18 }}>
                <div
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    background: 'rgba(8, 47, 73, 0.75)',
                    padding: 20,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <strong style={{ fontSize: 20 }}>모든 참가자가 준비되었습니다!</strong>
                  <p style={{ margin: 0, fontSize: 13, color: '#bae6fd', lineHeight: 1.6 }}>
                    전투 준비가 끝났습니다. 아래 버튼을 눌러 게임 방으로 이동하세요. 로딩 화면에서는 각 참가자의
                    초상화가 표시되며 게임이 곧 시작됩니다.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartModalOpen(false)
                      setStartStep('preview')
                      setMatchProgress(0)
                    }}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      background: 'rgba(15, 23, 42, 0.7)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    뒤로
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedGameId) {
                        router.push(`/rank/${selectedGameId}`)
                      }
                      setStartModalOpen(false)
                      setStartStep('preview')
                      setMatchProgress(0)
                    }}
                    style={{
                      padding: '12px 22px',
                      borderRadius: 999,
                      border: 'none',
                      background: '#38bdf8',
                      color: '#020617',
                      fontWeight: 800,
                    }}
                  >
                    전투 대기실로 이동
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#e2e8f0',
  fontSize: 15,
  lineHeight: 1.6,
}

function includesHero(value, heroId) {
  if (!value) return false
  if (Array.isArray(value)) return value.includes(heroId)
  return false
}

function formatDate(value) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '기록 없음'
  return date.toLocaleString()
}

function truncateText(value, maxLength) {
  if (!value) return ''
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function getResultStyles(result) {
  const normalized = (result || '').toLowerCase()
  if (normalized === 'win') {
    return {
      label: 'WIN',
      color: '#4ade80',
      background: 'rgba(22, 101, 52, 0.65)',
      border: '1px solid rgba(74, 222, 128, 0.45)',
    }
  }
  if (normalized === 'lose' || normalized === 'loss') {
    return {
      label: 'LOSE',
      color: '#f87171',
      background: 'rgba(127, 29, 29, 0.65)',
      border: '1px solid rgba(248, 113, 113, 0.45)',
    }
  }
  if (normalized === 'draw' || normalized === 'tie') {
    return {
      label: 'DRAW',
      color: '#fbbf24',
      background: 'rgba(161, 98, 7, 0.65)',
      border: '1px solid rgba(251, 191, 36, 0.45)',
    }
  }
  return {
    label: 'PENDING',
    color: '#38bdf8',
    background: 'rgba(30, 58, 138, 0.65)',
    border: '1px solid rgba(59, 130, 246, 0.45)',
  }
}

