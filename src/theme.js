const STORAGE_KEY = 'memoryviewer-theme'
const THEMES = new Set(['system', 'light', 'dark'])

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return THEMES.has(stored) ? stored : 'system'
}

export function resolvedTheme() {
  const theme = getTheme()
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function isDarkTheme() {
  return resolvedTheme() === 'dark'
}

export function setTheme(theme) {
  const next = THEMES.has(theme) ? theme : 'system'
  document.documentElement.dataset.theme = next
  localStorage.setItem(STORAGE_KEY, next)
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }))
}

export function initTheme() {
  document.documentElement.dataset.theme = getTheme()

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'system' } }))
    }
  })
}

export function chartCellLightness(depth = 0) {
  return isDarkTheme() ? 28 + depth * 2 : 72 - depth * 2
}
