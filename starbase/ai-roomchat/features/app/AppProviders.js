'use client'

import { AuthProvider } from '../auth'

export function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}
