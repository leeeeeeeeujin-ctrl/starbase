'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/router'

import { useAuth } from '../../features/auth'

export function useRedirectAuthenticated(destination = '/roster') {
  const router = useRouter()
  const { status, user } = useAuth()

  useEffect(() => {
    if (status !== 'ready') return
    if (!user) return

    router.replace(destination)
  }, [destination, router, status, user])
}
