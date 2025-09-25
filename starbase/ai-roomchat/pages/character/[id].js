// pages/character/[id].js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import CharacterDashboard from '@/components/character/CharacterDashboard'

const InlineStartClient = dynamic(() => import('../../components/rank/StartClient'), {
  ssr: false,
})

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
  const [heroLookup, setHeroLookup] = useState({})

  const [activeBattleGameId, setActiveBattleGameId] = useState(null)
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

      const { data, error } = await withTable(
        supabase,
        'heroes',
        (table) =>
          supabase
            .from(table)
            .select(
              'id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at',
            )
            .eq('id', id)
            .single(),
      )

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
        const { data, error } = await withTable(
          supabase,
          'rank_battles',
          (table) =>
            supabase
              .from(table)
              .select(fields)
              .eq('game_id', selectedGameId)
              .contains(column, [hero.id])
              .order('created_at', { ascending: false })
              .limit(40),
        )
        if (error) {
          console.warn('rank_battles contains fetch failed:', error.message)
          return []
        }
        return data || []
      }

      let attackRows = await fetchByColumn('attacker_hero_ids')
      let defendRows = await fetchByColumn('defender_hero_ids')

      if (!attackRows.length && !defendRows.length) {
        const { data, error } = await withTable(
          supabase,
          'rank_battles',
          (table) =>
            supabase
              .from(table)
              .select(fields)
              .eq('game_id', selectedGameId)
              .order('created_at', { ascending: false })
              .limit(40),
        )
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
        ? await withTable(
            supabase,
            'rank_battle_logs',
            (table) =>
              supabase
                .from(table)
                .select('battle_id, turn_no, prompt, ai_response, created_at')
                .in('battle_id', ids),
          )
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

  async function loadParticipations(heroId) {
    const selectFields =
      'id, game_id, owner_id, hero_id, hero_ids, role, score, rating, battles, created_at, updated_at'

    const [soloRes, packRes] = await Promise.all([
      withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).select(selectFields).eq('hero_id', heroId),
      ),
      withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).select(selectFields).contains('hero_ids', [heroId]),
      ),
    ])

    const soloRows = soloRes.data || []
    const packRows = packRes.data || []

    if (soloRes.error) console.warn('rank_participants hero_id fetch failed:', soloRes.error.message)
    if (packRes.error) console.warn('rank_participants hero_ids fetch failed:', packRes.error.message)

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
        ? withTable(supabase, 'rank_participants', (table) =>
            supabase
              .from(table)
              .select('id, game_id, owner_id, hero_id, role, rating, battles, score, updated_at')
              .in('game_id', gameIds),
          )
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
      const { data: heroRows, error: heroErr } = await withTable(
        supabase,
        'heroes',
        (table) =>
          supabase
            .from(table)
            .select('id, name, image_url, description, ability1, ability2, ability3, ability4')
            .in('id', missingHeroIds),
      )
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
      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).update(payload).eq('id', id),
      )
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
    const { error } = await withTable(supabase, 'heroes', (table) =>
      supabase.from(table).delete().eq('id', id),
    )
    if (error) {
      alert(error.message)
      return
    }
    router.replace('/roster')
  }

  function addAbilitySlot() {
    const nextKey = ABILITY_KEYS.find((key) => !(edit[key] && edit[key].trim()))
    if (!nextKey) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
      return
    }
    setEdit((prev) => ({ ...prev }))
  }

  function reverseAbilities() {
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

  const heroName = edit.name || '이름 없는 캐릭터'
  const handleEditChange = useCallback((key, value) => {
    setEdit((state) => ({ ...state, [key]: value }))
  }, [])
  const handleSelectGame = useCallback(
    (gameId) => {
      if (!gameId) return
      setSelectedGameId(gameId)
    },
    [],
  )
  const startBattleFromDetail = useCallback(() => {
    if (selectedGameId) {
      setActiveBattleGameId(selectedGameId)
    }
  }, [selectedGameId])

  return (
    <>
      <CharacterDashboard
        hero={hero}
        heroName={heroName}
        edit={edit}
        onChangeEdit={handleEditChange}
        saving={saving}
        onSave={save}
        onDelete={remove}
        backgroundPreview={backgroundPreview}
        backgroundError={backgroundError}
        onBackgroundUpload={handleBackgroundUpload}
        onClearBackground={clearBackgroundAsset}
        backgroundInputRef={backgroundInputRef}
        bgmBlob={bgmBlob}
        bgmLabel={bgmLabel}
        bgmDuration={bgmDuration}
        bgmError={bgmError}
        onBgmUpload={handleBgmUpload}
        onClearBgm={clearBgmAsset}
        bgmInputRef={bgmInputRef}
        abilityCards={abilityCards}
        onAddAbility={addAbilitySlot}
        onReverseAbilities={reverseAbilities}
        onClearAbility={clearAbility}
        statSlides={statSlides}
        selectedGameId={selectedGameId}
        onSelectGame={handleSelectGame}
        participations={participations}
        selectedGame={selectedGame}
        selectedEntry={selectedEntry}
        selectedScoreboard={selectedScoreboard}
        heroLookup={heroLookup}
        battleSummary={battleSummary}
        battleDetails={battleDetails}
        visibleBattles={visibleBattles}
        onShowMoreBattles={showMoreBattles}
        battleLoading={battleLoading}
        battleError={battleError}
        onStartBattle={startBattleFromDetail}
        onBack={() => router.back()}
        onGoLobby={() => router.push(`/lobby?heroId=${hero.id}`)}
      />
      {activeBattleGameId ? (
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
              position: 'relative',
              width: '100%',
              maxWidth: 960,
              height: '90vh',
              borderRadius: 28,
              overflow: 'hidden',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(2, 6, 23, 0.96)',
              boxShadow: '0 50px 120px -60px rgba(56, 189, 248, 0.85)',
              display: 'flex',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveBattleGameId(null)}
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                zIndex: 10,
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            >
              닫기
            </button>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <InlineStartClient
                gameId={activeBattleGameId}
                onRequestClose={() => setActiveBattleGameId(null)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  }

function includesHero(value, heroId) {
  if (!value) return false
  if (Array.isArray(value)) return value.includes(heroId)
  return false
}


// 
