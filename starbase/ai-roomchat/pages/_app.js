import React from 'react'

import { AuthProvider } from '../features/auth'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}
