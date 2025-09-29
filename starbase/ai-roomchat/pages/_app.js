import React from 'react'
import { useRouter } from 'next/router'

import SharedHeroOverlay from '@/components/character/SharedHeroOverlay'
import ActiveMatchOverlay from '@/components/rank/ActiveMatchOverlay'

import '../styles/globals.css'

function OverlayAwareShell({ children }) {
  const router = useRouter()
  const path = router.asPath || ''
  const hideOverlay =
    path.startsWith('/character') || path.startsWith('/roster') || path.startsWith('/maker') || path.startsWith('/prompt')

  return (
    <>
      {children}
      {!hideOverlay ? <SharedHeroOverlay /> : null}
      <ActiveMatchOverlay />
    </>
  )
}

export default function App({ Component, pageProps }) {
  return (
    <OverlayAwareShell>
      <Component {...pageProps} />
    </OverlayAwareShell>
  )
}
