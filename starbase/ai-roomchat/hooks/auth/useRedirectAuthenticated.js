'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/router'

import { AUTH_STATUS_VALUES, useAuth } from '../../features/auth'

export function useRedirectAuthenticated(destination = '/roster') {
  const router = useRouter()
  const { status, user } = useAuth()

  useEffect(() => {
    if (!router.isReady) return
    if (status !== AUTH_STATUS_VALUES.READY) return
    if (!user) return

    router.replace(destination)
  }, [destination, router, status, user])
}
