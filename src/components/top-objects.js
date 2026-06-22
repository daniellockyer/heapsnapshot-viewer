import { formatBytes } from '../format.js'

export function createTopObjects({ onSelect, queryWorker }) {
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="table-toolbar">
      <span>Top 100 objects by shallow size</span>
      <button type="button" class="btn btn-secondary">Load</button>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Shallow Size</th>
          <th>Retained Size</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `

  const tbody = container.querySelector('tbody')
  const loadBtn = container.querySelector('button')
  let loaded = false

  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Click Load to scan all nodes (may take a moment for large snapshots)</td></tr>'

  loadBtn.addEventListener('click', async () => {
    if (loaded) return
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>'
    loadBtn.disabled = true

    const objects = await queryWorker('topObjects', { limit: 100 })
    loaded = true
    render(objects)
  })

  function render(objects) {
    if (!objects.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No objects found</td></tr>'
      return
    }

    tbody.innerHTML = objects.map((obj) => `
      <tr data-index="${obj.nodeIndex}">
        <td class="constructor-name">${escapeHtml(obj.name)}</td>
        <td>${escapeHtml(obj.type)}</td>
        <td class="num">${formatBytes(obj.selfSize)}</td>
        <td class="num">${formatBytes(obj.retainedSize)}</td>
        <td class="num">@${obj.id}</td>
      </tr>
    `).join('')

    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        onSelect({ type: 'node', nodeIndex: parseInt(tr.dataset.index, 10) })
      })
    })
  }

  return {
    el: container,
    reset() {
      loaded = false
      loadBtn.disabled = false
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Click Load to scan all nodes (may take a moment for large snapshots)</td></tr>'
    },
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
