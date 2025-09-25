import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { playRank, registerGame } from '../../lib/rank/api'

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function useRankHub() {
  const [user, setUser] = useState(null)
  const [initialized, setInitialized] = useState(false)

  const [games, setGames] = useState([])
  const [participants, setParticipants] = useState([])

  const [gName, setGName] = useState('테스트 게임')
  const [gDesc, setGDesc] = useState('MVP 테스트용')
  const [gImage, setGImage] = useState('')
  const [gPromptSetId, setGPromptSetId] = useState('')
  const [roles, setRoles] = useState([
    { name: '공격', slot_count: 2 },
    { name: '수비', slot_count: 1 },
    { name: '서포트', slot_count: 1 },
  ])
  const totalSlots = useMemo(
    () => roles.reduce((sum, role) => sum + (Number(role.slot_count) || 0), 0),
    [roles]
  )

  const [selGameId, setSelGameId] = useState('')
  const [heroIdsCSV, setHeroIdsCSV] = useState('')
  const heroIds = useMemo(() => parseCsv(heroIdsCSV), [heroIdsCSV])

  const [playGameId, setPlayGameId] = useState('')
  const [playHeroIdsCSV, setPlayHeroIdsCSV] = useState('')
  const [userApiKey, setUserApiKey] = useState('')
  const [playResult, setPlayResult] = useState('')
  const playHeroIds = useMemo(() => parseCsv(playHeroIdsCSV), [playHeroIdsCSV])

  const refreshLists = useCallback(async () => {
    const { data: gameRows } = await supabase
      .from('rank_games')
      .select('id,name,description,created_at')
      .order('created_at', { ascending: false })

    const list = gameRows || []
    setGames(list)

    const latestGameId = list[0]?.id
    if (latestGameId) {
      const { data: partRows } = await supabase
        .from('rank_participants')
        .select('owner_id, rating, battles, likes')
        .eq('game_id', latestGameId)
        .order('rating', { ascending: false })
        .limit(50)
      setParticipants(partRows || [])
    } else {
      setParticipants([])
    }

    if (latestGameId) {
      setSelGameId((prev) => prev || latestGameId)
      setPlayGameId((prev) => prev || latestGameId)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (active) {
          setUser(data?.user || null)
        }
        await refreshLists()
      } finally {
        if (active) {
          setInitialized(true)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [refreshLists])

  const onCreateGame = useCallback(async () => {
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }
    if (!gPromptSetId) {
      alert('prompt_set_id를 입력하세요.')
      return
    }

    const response = await registerGame({
      name: gName,
      description: gDesc,
      image_url: gImage,
      prompt_set_id: gPromptSetId,
      roles: roles.map((role) => ({
        name: role.name || '역할',
        slot_count: Number(role.slot_count) || 1,
      })),
    })

    if (response.ok) {
      alert('게임 등록 완료')
      setGName('테스트 게임')
      setGDesc('MVP 테스트용')
      setGImage('')
      setGPromptSetId('')
      await refreshLists()
    } else {
      alert('등록 실패: ' + (response.error || 'unknown'))
    }
  }, [gDesc, gImage, gName, gPromptSetId, refreshLists, roles, user])

  const onJoin = useCallback(async () => {
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }
    if (!selGameId) {
      alert('게임을 선택하세요.')
      return
    }
    if (!heroIds.length) {
      alert('히어로 ID들을 입력하세요.')
      return
    }

    const { error } = await supabase.from('rank_participants').upsert(
      {
        game_id: selGameId,
        owner_id: user.id,
        hero_ids: heroIds,
      },
      { onConflict: 'game_id,owner_id' }
    )

    if (error) {
      alert(error.message)
    } else {
      alert('참가/팩 저장 완료')
      await refreshLists()
    }
  }, [heroIds, refreshLists, selGameId, user])

  const onPlay = useCallback(async () => {
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }
    if (!playGameId) {
      alert('게임 선택')
      return
    }
    if (!playHeroIds.length) {
      alert('히어로 ID들을 입력')
      return
    }
    if (!userApiKey) {
      alert('OpenAI API 키를 입력')
      return
    }

    setPlayResult('요청 중…')
    const result = await playRank({
      gameId: playGameId,
      heroIds: playHeroIds,
      userApiKey,
    })
    setPlayResult(JSON.stringify(result, null, 2))

    if (result.ok) {
      await refreshLists()
    }
  }, [playGameId, playHeroIds, refreshLists, user, userApiKey])

  return {
    user,
    initialized,
    games,
    participants,
    refreshLists,
    roles,
    setRoles,
    gName,
    setGName,
    gDesc,
    setGDesc,
    gImage,
    setGImage,
    gPromptSetId,
    setGPromptSetId,
    totalSlots,
    onCreateGame,
    selGameId,
    setSelGameId,
    heroIdsCSV,
    setHeroIdsCSV,
    onJoin,
    playGameId,
    setPlayGameId,
    playHeroIdsCSV,
    setPlayHeroIdsCSV,
    userApiKey,
    setUserApiKey,
    onPlay,
    playResult,
  }
}
