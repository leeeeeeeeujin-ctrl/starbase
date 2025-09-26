import React from 'react'

const defaultTheme = {
  titleText: '천계전선',
  subtitleText: '',
  backgroundImage: '/landing/celestial-frontline.svg',
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundOverlay: 'rgba(0, 0, 0, 0.45)',
  bgmSource: '',
  bgmName: '',
}

const storageKey = 'starbase:title-theme'

const TitleThemeContext = React.createContext(null)

function safeParseTheme(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    console.warn('Failed to parse stored title theme', error)
  }
  return null
}

export function TitleThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(defaultTheme)
  const [adminVisible, setAdminVisible] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(storageKey)
    const storedTheme = safeParseTheme(raw)

    if (storedTheme) {
      setTheme((prev) => ({ ...prev, ...storedTheme }))
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(theme))
    } catch (error) {
      console.warn('Failed to persist title theme', error)
    }
  }, [theme])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const api = {
      enable: () => setAdminVisible(true),
      disable: () => setAdminVisible(false),
      toggle: () => setAdminVisible((prev) => !prev),
      reset: () => setTheme(defaultTheme),
      setTheme: (next) => {
        if (next && typeof next === 'object') {
          setTheme((prev) => ({ ...prev, ...next }))
        }
      },
    }

    window.__STARBASE_TITLE_ADMIN__ = api
    const handleKeydown = (event) => {
      if (event.key && event.key.toLowerCase() === 't' && event.shiftKey && event.altKey) {
        event.preventDefault()
        api.toggle()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      if (window.__STARBASE_TITLE_ADMIN__ === api) {
        delete window.__STARBASE_TITLE_ADMIN__
      }
    }
  }, [])

  const updateTheme = React.useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return
    setTheme((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetTheme = React.useCallback(() => {
    setTheme(defaultTheme)
  }, [])

  const value = React.useMemo(
    () => ({
      theme,
      updateTheme,
      resetTheme,
      adminVisible,
      setAdminVisible,
      defaultTheme,
    }),
    [theme, updateTheme, resetTheme, adminVisible, setAdminVisible]
  )

  return (
    <TitleThemeContext.Provider value={value}>
      {children}
    </TitleThemeContext.Provider>
  )
}

export function useTitleThemeContext() {
  const context = React.useContext(TitleThemeContext)
  if (!context) {
    throw new Error('useTitleThemeContext must be used within TitleThemeProvider')
  }
  return context
}

export function useTitleTheme() {
  const { theme } = useTitleThemeContext()
  return theme
}

