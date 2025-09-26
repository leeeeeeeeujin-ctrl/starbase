import { useEffect } from 'react'

import { supabase } from '@/lib/supabase'

let watcherRegistered = false
let unsubscribe = null

function applySessionToStorage(session) {
  if (typeof window === 'undefined') return

  try {
    const userId = session?.user?.id || null
    const storage = window.localStorage
    const lastUserKey = 'lastAuthenticatedUserId'

    if (!userId) {
      storage.removeItem(lastUserKey)
      return
    }

    storage.setItem(lastUserKey, userId)

    const selectedOwnerId = storage.getItem('selectedHeroOwnerId')
    if (selectedOwnerId && selectedOwnerId !== userId) {
      storage.removeItem('selectedHeroId')
      storage.removeItem('selectedHeroOwnerId')
    }
  } catch (error) {
    console.error('Failed to sync session state with local storage:', error)
  }
}

export function useSupabaseSessionSync() {
  useEffect(() => {
    if (watcherRegistered) {
      return () => {}
    }

    watcherRegistered = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to resolve initial Supabase session:', error)
          return
        }
        applySessionToStorage(data?.session)
      })
      .catch((error) => {
        console.error('Unexpected error while hydrating Supabase session:', error)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionToStorage(session)
    })

    unsubscribe = listener?.subscription || null

    return () => {
      unsubscribe?.unsubscribe()
      unsubscribe = null
      watcherRegistered = false
    }
  }, [])
}
