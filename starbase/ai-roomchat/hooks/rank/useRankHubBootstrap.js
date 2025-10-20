import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

async function fetchParticipants(gameId) {
  if (!gameId) {
    return []
  }

  const { data } = await supabase
    .from('rank_participants')
    .select('owner_id, rating, battles, likes')
    .eq('game_id', gameId)
    .order('rating', { ascending: false })
    .limit(50)

  return data || []
}

export function useRankHubBootstrap() {
  const [user, setUser] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [games, setGames] = useState([])
  const [participants, setParticipants] = useState([])

  const refreshGames = useCallback(async () => {
    const { data } = await supabase
      .from('rank_games')
      .select('id,name,description,created_at')
      .order('created_at', { ascending: false })

    const list = data || []
    setGames(list)
    return list
  }, [])

  const refreshParticipants = useCallback(async (gameId) => {
    const list = await fetchParticipants(gameId)
    setParticipants(list)
    return list
  }, [])

  const refreshLists = useCallback(
    async (preferredGameId) => {
      const list = await refreshGames()
      const targetGameId = preferredGameId || list[0]?.id || null
      await refreshParticipants(targetGameId)

      return { games: list, activeGameId: targetGameId }
    },
    [refreshGames, refreshParticipants]
  )

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

  return {
    user,
    initialized,
    games,
    participants,
    refreshLists,
  }
}
