import React from 'react'

import { AppProviders } from '../features/app/AppProviders'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <AppProviders>
      <Component {...pageProps} />
    </AppProviders>
  )
}
