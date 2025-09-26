import React from 'react'

import { useSupabaseSessionSync } from '@/hooks/auth/useSupabaseSessionSync'
import { TitleThemeProvider } from '@/hooks/title/TitleThemeContext'
import dynamic from 'next/dynamic'

import '../styles/globals.css'

const TitleThemeAdminOverlay = dynamic(
  () => import('@/components/title/TitleThemeAdminOverlay'),
  { ssr: false }
)

export default function App({ Component, pageProps }) {
  useSupabaseSessionSync()
  return (
    <TitleThemeProvider>
      <Component {...pageProps} />
      <TitleThemeAdminOverlay />
    </TitleThemeProvider>
  )
}
