import { createContext, useContext, useEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

function applyResolvedTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function runThemeTransition(update: () => void) {
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> }
  }

  if (!transitionDocument.startViewTransition) {
    update()
    return
  }

  transitionDocument.startViewTransition(() => {
    update()
  })
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isFirstRender = useRef(true)
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    return (localStorage.getItem('theme') as Theme) || 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (theme === 'system') return getSystemTheme()
    return theme
  })

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme
    const applyTheme = () => {
      setResolvedTheme(resolved)
      applyResolvedTheme(resolved)
    }

    if (isFirstRender.current) {
      isFirstRender.current = false
      applyTheme()
      return
    }

    runThemeTransition(applyTheme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onMediaChange() {
      if (theme === 'system') {
        const resolved = getSystemTheme()
        runThemeTransition(() => {
          setResolvedTheme(resolved)
          applyResolvedTheme(resolved)
        })
      }
    }

    media.addEventListener('change', onMediaChange)
    return () => media.removeEventListener('change', onMediaChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
