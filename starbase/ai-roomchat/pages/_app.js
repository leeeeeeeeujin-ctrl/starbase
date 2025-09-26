import React from 'react'

import { useSupabaseSessionSync } from '@/hooks/auth/useSupabaseSessionSync'

import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  useSupabaseSessionSync()
  return <Component {...pageProps} />
}
