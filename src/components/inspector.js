import { formatBytes } from '../format.js'

export function createInspector({ queryWorker }) {
  const panel = document.createElement('aside')
  panel.className = 'inspector-panel hidden'
  panel.innerHTML = `
    <div class="inspector-header">Object Inspector</div>
    <div class="inspector-body">
      <p class="empty-state">Select an object to inspect</p>
    </div>
  `

  const body = panel.querySelector('.inspector-body')
  let currentNodeIndex = null

  async function show(selection) {
    panel.classList.remove('hidden')

    if (selection.type === 'class') {
      body.innerHTML = `
        <h3>${escapeHtml(selection.name)}</h3>
        <dl class="inspector-meta">
          <dt>Count</dt><dd>${selection.row.count.toLocaleString()}</dd>
          <dt>Shallow Size</dt><dd>${formatBytes(selection.row.self)}</dd>
          <dt>Retained Size</dt><dd>${formatBytes(selection.row.maxRet)}</dd>
          <dt>Distance</dt><dd>${selection.row.distance}</dd>
        </dl>
        <p class="search-hint">Double-click a frame in the flamegraph to zoom in, or pick an instance from Top Objects / Search for retainer paths.</p>
      `
      return
    }

    const nodeIndex = selection.nodeIndex
    currentNodeIndex = nodeIndex

    body.innerHTML = `
      <div class="retainer-loading">Loading…</div>
    `

    const [node, path] = await Promise.all([
      queryWorker('nodeDetail', { nodeIndex }),
      queryWorker('retainers', { nodeIndex }),
    ])

    if (currentNodeIndex !== nodeIndex) return

    if (!node) {
      body.innerHTML = '<p class="empty-state">Node not found</p>'
      return
    }

    const detachedBadge = node.detached ? '<span class="badge">Detached DOM</span>' : ''

    body.innerHTML = `
      <h3>${escapeHtml(node.name)}${detachedBadge}</h3>
      <dl class="inspector-meta">
        <dt>Type</dt><dd>${escapeHtml(node.type)}</dd>
        <dt>Class</dt><dd>${escapeHtml(node.className)}</dd>
        <dt>ID</dt><dd>@${node.id}</dd>
        <dt>Shallow Size</dt><dd>${formatBytes(node.selfSize)}</dd>
        <dt>Retained Size</dt><dd>${formatBytes(node.retainedSize)}</dd>
        <dt>Distance</dt><dd>${node.distance}</dd>
      </dl>
      <h4>Retainer Path</h4>
      <div class="retainer-tree">${renderRetainerPath(path)}</div>
    `
  }

  function hide() {
    panel.classList.add('hidden')
  }

  return { el: panel, show, hide }
}

function renderRetainerPath(path) {
  if (!path.length) {
    return '<p class="empty-state">No retainer path found</p>'
  }

  return path.map((item, i) => {
    const edge = i > 0 && item.edgeType
      ? `<div class="retainer-edge">↳ ${escapeHtml(item.edgeType)} "${escapeHtml(item.edgeName ?? '')}"</div>`
      : ''
    return `
      ${edge}
      <div class="retainer-item">
        <span class="retainer-node">${escapeHtml(item.name)}</span>
        <span class="retainer-edge"> (${escapeHtml(item.type)}, ${formatBytes(item.selfSize)} shallow, @${item.id})</span>
      </div>
    `
  }).join('')
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
