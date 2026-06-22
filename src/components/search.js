import { formatBytes } from '../format.js'

export function createSearch({ onSelect, queryWorker }) {
  const container = document.createElement('div')
  container.className = 'search-panel'
  container.innerHTML = `
    <div class="search-input-row">
      <input type="search" placeholder="Search by name or @nodeId…" />
      <button type="button" class="btn">Search</button>
    </div>
    <p class="search-hint">Examples: <code>Array</code>, <code>require</code>, <code>@12345</code></p>
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

  const input = container.querySelector('input')
  const btn = container.querySelector('button')
  const tbody = container.querySelector('tbody')

  async function doSearch() {
    const query = input.value.trim()
    if (!query) return

    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Searching…</td></tr>'
    const results = await queryWorker('search', { query })
    render(results)
  }

  btn.addEventListener('click', doSearch)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch()
  })

  function render(results) {
    if (!results.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No results</td></tr>'
      return
    }

    tbody.innerHTML = results.map((obj) => `
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

  return { el: container }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
