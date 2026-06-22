import { getTheme, setTheme } from '../theme.js'

export function createThemeToggle() {
  const el = document.createElement('div')
  el.className = 'theme-toggle'
  el.innerHTML = `
    <label class="theme-toggle-label">
      <span>Theme</span>
      <select aria-label="Color theme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  `

  const select = el.querySelector('select')
  select.value = getTheme()

  select.addEventListener('change', () => {
    setTheme(select.value)
  })

  window.addEventListener('themechange', () => {
    select.value = getTheme()
  })

  return el
}
