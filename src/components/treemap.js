import { formatBytes } from '../format.js'
import { chartCellLightness } from '../theme.js'

const TOP_N = 40

const HUES = [
  210, 180, 150, 120, 90, 60, 30, 0, 330, 300, 270, 240,
]

export function createTreemap({ onSelect }) {
  const container = document.createElement('div')
  container.className = 'treemap-container'
  container.innerHTML = '<div class="treemap"></div>'

  const treemap = container.querySelector('.treemap')
  let selectedKey = null
  let cachedAggregates = null

  function render(aggregates) {
    cachedAggregates = aggregates
    const sorted = [...aggregates].sort((a, b) => b.maxRet - a.maxRet)
    const top = sorted.slice(0, TOP_N)
    const otherRet = sorted.slice(TOP_N).reduce((sum, a) => sum + a.maxRet, 0)
    const items = [...top]
    if (otherRet > 0) {
      items.push({ key: '__other__', name: 'Other', maxRet: otherRet, count: sorted.length - TOP_N })
    }

    const total = items.reduce((s, i) => s + i.maxRet, 0)
    treemap.innerHTML = ''

    items.forEach((item, i) => {
      const pct = (item.maxRet / total) * 100
      const cell = document.createElement('div')
      cell.className = 'treemap-cell' + (item.key === selectedKey ? ' selected' : '')
      cell.style.flexGrow = item.maxRet
      cell.style.flexBasis = `${Math.max(pct, 2)}%`
      cell.style.background = `hsl(${HUES[i % HUES.length]}, 45%, ${chartCellLightness()}%)`

      const label = document.createElement('div')
      label.className = 'treemap-label'
      label.innerHTML = `
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="size">${formatBytes(item.maxRet)}</div>
      `
      cell.appendChild(label)

      if (item.key !== '__other__') {
        cell.addEventListener('click', () => {
          selectedKey = item.key
          render(aggregates)
          onSelect({ type: 'class', classKey: item.key, name: item.name })
        })
      }

      treemap.appendChild(cell)
    })
  }

  window.addEventListener('themechange', () => {
    if (cachedAggregates) render(cachedAggregates)
  })

  return {
    el: container,
    setData(aggregates) {
      render(aggregates)
    },
    selectByKey(key) {
      selectedKey = key
    },
    highlight(key, aggregates) {
      selectedKey = key
      if (aggregates) render(aggregates)
    },
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
