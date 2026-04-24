import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

let mediaQueryCleanup: (() => void) | null = null

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme
  }

  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme)

  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.classList.toggle('light', resolvedTheme === 'light')
}

function bindSystemTheme(theme: Theme) {
  mediaQueryCleanup?.()
  mediaQueryCleanup = null

  if (theme !== 'system' || typeof window === 'undefined') {
    return
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleThemeChange = () => applyTheme('system')

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleThemeChange)
    mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handleThemeChange)
    return
  }

  mediaQuery.addListener(handleThemeChange)
  mediaQueryCleanup = () => mediaQuery.removeListener(handleThemeChange)
}

export function initTheme() {
  if (typeof window === 'undefined') {
    return
  }

  let persistedTheme: Theme = 'system'

  try {
    const raw = window.localStorage.getItem('docmind-theme')
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: Theme } }
      if (parsed.state?.theme) {
        persistedTheme = parsed.state.theme
      }
    }
  } catch {
    persistedTheme = 'system'
  }

  applyTheme(persistedTheme)
  bindSystemTheme(persistedTheme)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme)
        bindSystemTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'docmind-theme',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        applyTheme(state.theme)
        bindSystemTheme(state.theme)
      },
    }
  )
)
