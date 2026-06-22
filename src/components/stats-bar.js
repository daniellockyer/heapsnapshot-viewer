import { formatBytes, formatCount, formatDuration } from '../format.js'

export function createStatsBar() {
  const el = document.createElement('div')
  el.className = 'stats-bar'
  el.hidden = true

  function update(stats, staticData, parseDuration) {
    el.hidden = false
    el.innerHTML = `
    <div class="stat">
      <span class="stat-label">Total</span>
      <span class="stat-value">${formatBytes(stats.total)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">V8 Heap</span>
      <span class="stat-value">${formatBytes(stats.v8heap.total)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Native</span>
      <span class="stat-value">${formatBytes(stats.native.total)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Nodes</span>
      <span class="stat-value">${formatCount(staticData.nodeCount)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Shallow Size</span>
      <span class="stat-value">${formatBytes(staticData.totalSize)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Parse Time</span>
      <span class="stat-value">${formatDuration(parseDuration)}</span>
    </div>
  `
  }

  return { el, update }
}
