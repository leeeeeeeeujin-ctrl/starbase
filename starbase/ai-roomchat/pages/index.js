import React from 'react'

import { LandingPage } from '../features/landing/LandingPage'
import { useRedirectAuthenticated } from '../hooks/auth/useRedirectAuthenticated'

export default function Home() {
  useRedirectAuthenticated('/roster')
  return <LandingPage />
}
