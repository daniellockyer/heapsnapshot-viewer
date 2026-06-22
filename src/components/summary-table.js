import { formatBytes, formatCount } from '../format.js'

const COLUMNS = [
  { key: 'name', label: 'Constructor', align: 'left' },
  { key: 'count', label: 'Count', align: 'right' },
  { key: 'self', label: 'Shallow Size', align: 'right' },
  { key: 'maxRet', label: 'Retained Size', align: 'right' },
  { key: 'distance', label: 'Distance', align: 'right' },
]

export function createSummaryTable({ onSelect }) {
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="table-toolbar">
      <input type="search" placeholder="Filter constructors…" />
    </div>
    <table class="data-table">
      <thead><tr></tr></thead>
      <tbody></tbody>
    </table>
  `

  const thead = container.querySelector('thead tr')
  const tbody = container.querySelector('tbody')
  const filterInput = container.querySelector('input')

  let data = []
  let sortKey = 'maxRet'
  let sortDir = 'desc'
  let selectedKey = null
  let filter = ''

  COLUMNS.forEach((col) => {
    const th = document.createElement('th')
    th.textContent = col.label
    th.dataset.key = col.key
    th.addEventListener('click', () => {
      if (sortKey === col.key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        sortKey = col.key
        sortDir = col.key === 'name' ? 'asc' : 'desc'
      }
      render()
    })
    thead.appendChild(th)
  })

  filterInput.addEventListener('input', () => {
    filter = filterInput.value.toLowerCase()
    render()
  })

  function render() {
    const filtered = data.filter((row) =>
      !filter || row.name.toLowerCase().includes(filter)
    )

    filtered.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })

    thead.querySelectorAll('th').forEach((th) => {
      th.classList.remove('sorted-asc', 'sorted-desc')
      if (th.dataset.key === sortKey) {
        th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc')
      }
    })

    tbody.innerHTML = filtered.map((row) => `
      <tr data-key="${escapeAttr(row.key)}" class="${row.key === selectedKey ? 'selected' : ''}">
        <td class="constructor-name">${escapeHtml(row.name)}</td>
        <td class="num">${formatCount(row.count)}</td>
        <td class="num">${formatBytes(row.self)}</td>
        <td class="num">${formatBytes(row.maxRet)}</td>
        <td class="num">${row.distance}</td>
      </tr>
    `).join('')

    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        const key = tr.dataset.key
        const row = data.find((r) => r.key === key)
        if (!row) return
        selectedKey = key
        render()
        onSelect({ type: 'class', classKey: key, name: row.name, row })
      })
    })
  }

  return {
    el: container,
    setData(aggregates) {
      data = aggregates
      render()
    },
    selectByKey(key) {
      selectedKey = key
      render()
    },
    getData() {
      return data
    },
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;')
}
