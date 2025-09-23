// pages/character/[id].js
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'

const LOGS_SLICE = 5

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
        .select('id,name,image_url,description,ability1,ability2,ability3,ability4,owner_id,created_at')
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
      })
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
      const fields =
        'id, game_id, created_at, result, score_delta, attacker_owner_id, attacker_hero_ids, defender_owner_id, defender_hero_ids'

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
        const fallback = (data || []).filter((row) =>
          includesHero(row.attacker_hero_ids, hero.id) || includesHero(row.defender_hero_ids, hero.id),
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
        logs: (logsMap.get(battle.id) || []).sort(
          (a, b) => (a.turn_no ?? 0) - (b.turn_no ?? 0),
        ),
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

    if (!rows.length) {
      setSelectedGameId(null)
    } else if (!rows.find((row) => row.game_id === selectedGameId)) {
      setSelectedGameId(rows[0].game_id)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: edit.name,
        description: edit.description,
        ability1: edit.ability1,
        ability2: edit.ability2,
        ability3: edit.ability3,
        ability4: edit.ability4,
      }
      const { error } = await supabase.from('heroes').update(payload).eq('id', id)
      if (error) throw error
      setHero((prev) => (prev ? { ...prev, ...payload } : prev))
      alert('저장 완료')
    } catch (error) {
      alert(error.message || error)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('정말 삭제할까요? 복구할 수 없습니다.')) return
    const { error } = await supabase.from('heroes').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    router.replace('/roster')
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e2e8f0',
        position: 'relative',
      }}
    >
      {/* ... (UI 렌더링 부분, 네가 준 코드 그대로) ... */}
    </div>
  )
}

const inputStyle = {
  padding: '12px 16px',
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.65)',
  color: '#e2e8f0',
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
