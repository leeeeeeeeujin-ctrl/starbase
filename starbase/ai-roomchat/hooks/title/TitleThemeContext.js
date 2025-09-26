import React from 'react'

import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'

const defaultTheme = {
  titleText: '천계전선',
  subtitleText: '',
  backgroundImage: '/landing/celestial-frontline.svg',
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundOverlay: 'rgba(0, 0, 0, 0.45)',
  backgroundName: '',
  bgmSource: '',
  bgmName: '',
  announcement: '',
  numericFontFamily: '',
  numericFontSource: '',
  numericFontName: '',
}

const storageKey = 'starbase:title-theme'
const THEME_KEY = 'title_theme'
const FONT_STYLE_ID = 'starbase-numeric-font-style'

const TitleThemeContext = React.createContext(null)

function safeParseTheme(raw) {
  if (!raw) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
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

function mergeTheme(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  return { ...base, ...patch }
}

function normaliseTheme(next) {
  const parsed = safeParseTheme(next)
  if (!parsed) return null
  return mergeTheme(defaultTheme, parsed)
}

function shallowEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function applyNumericFont(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const fallback = '"Noto Sans KR", sans-serif'
  const fontFamily = theme.numericFontFamily?.trim()
  const resolvedFamily = fontFamily || 'Starbase Numeric'
  root.style.setProperty('--starbase-number-font', fontFamily ? `'${fontFamily.replace(/'/g, "\\'")}'` : fallback)

  let style = document.getElementById(FONT_STYLE_ID)
  if (theme.numericFontSource) {
    const safeFamily = resolvedFamily.replace(/'/g, "\\'")
    if (!style) {
      style = document.createElement('style')
      style.id = FONT_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = `@font-face {\n  font-family: '${safeFamily}';\n  src: url('${theme.numericFontSource}');\n  font-display: swap;\n}`
    root.style.setProperty('--starbase-number-font', `'${safeFamily}'`)
  } else if (style) {
    style.remove()
  }
}

export function TitleThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(defaultTheme)
  const [adminVisible, setAdminVisible] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [tableName, setTableName] = React.useState(null)

  const updateThemeState = React.useCallback((updater) => {
    setTheme((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : mergeTheme(prev, updater)
      if (!shallowEqual(prev, next)) {
        setDirty(true)
      }
      return next
    })
  }, [])

  const resetTheme = React.useCallback(() => {
    setTheme({ ...defaultTheme })
    setDirty(true)
  }, [])

  const loadTheme = React.useCallback(async () => {
    if (typeof window === 'undefined') return
    setLoading(true)
    const { data, error, table } = await withTable(supabase, 'ui_configs', (tableName) =>
      supabase.from(tableName).select('value, updated_at').eq('key', THEME_KEY).maybeSingle(),
    )
    if (table) {
      setTableName(table)
    }
    if (error) {
      console.warn('Failed to load title theme from Supabase', error)
      setLoading(false)
      return
    }
    const parsed = normaliseTheme(data?.value)
    if (parsed) {
      setTheme(parsed)
      setDirty(false)
    }
    setLoading(false)
  }, [])

  const saveTheme = React.useCallback(async () => {
    if (saving) return
    setSaving(true)
    const payload = {
      key: THEME_KEY,
      value: theme,
      updated_at: new Date().toISOString(),
    }
    const { error } = await withTable(supabase, 'ui_configs', (tableName) =>
      supabase.from(tableName).upsert(payload, { onConflict: 'key' }),
    )
    setSaving(false)
    if (error) {
      console.warn('Failed to save title theme', error)
      throw error
    }
    setDirty(false)
  }, [theme, saving])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(storageKey)
    const storedTheme = safeParseTheme(raw)

    if (storedTheme) {
      setTheme((prev) => mergeTheme(prev, storedTheme))
      setDirty(false)
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
    applyNumericFont(theme)
  }, [theme])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const api = {
      enable: () => setAdminVisible(true),
      disable: () => setAdminVisible(false),
      toggle: () => setAdminVisible((prev) => !prev),
      reset: () => resetTheme(),
      setTheme: (next) => {
        if (next && typeof next === 'object') {
          updateThemeState(next)
        }
      },
      save: async () => saveTheme(),
      reload: async () => loadTheme(),
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
  }, [loadTheme, resetTheme, saveTheme, updateThemeState])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadTheme()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadTheme])

  React.useEffect(() => {
    if (!tableName) return
    const channel = supabase
      .channel(`title-theme:${tableName}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `key=eq.${THEME_KEY}`,
        },
        (payload) => {
          const parsed = normaliseTheme(payload.new?.value)
          if (parsed) {
            setTheme(parsed)
            setDirty(false)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tableName])

  const updateTheme = React.useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return
    updateThemeState((prev) => mergeTheme(prev, patch))
  }, [updateThemeState])

  const value = React.useMemo(
    () => ({
      theme,
      updateTheme,
      resetTheme,
      adminVisible,
      setAdminVisible,
      defaultTheme,
      saveTheme,
      loadTheme,
      loading,
      saving,
      dirty,
    }),
    [
      theme,
      updateTheme,
      resetTheme,
      adminVisible,
      setAdminVisible,
      defaultTheme,
      saveTheme,
      loadTheme,
      loading,
      saving,
      dirty,
    ],
  )

  return <TitleThemeContext.Provider value={value}>{children}</TitleThemeContext.Provider>
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

