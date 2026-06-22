import { formatBytes } from '../format.js'
import { layoutIcicle, flameColor } from '../flame-tree.js'

const ROW_HEIGHT = 22

export function createFlamegraph({ aggregates, totalRetained, hasAllocationTraces, queryWorker, onSelect }) {
  const container = document.createElement('div')
  container.className = 'flamegraph-panel'
  container.innerHTML = `
    <div class="flamegraph-toolbar">
      <div class="flame-breadcrumb"></div>
      <div class="flamegraph-actions">
        <button type="button" class="btn btn-secondary flame-reset" hidden>Reset zoom</button>
      </div>
    </div>
    <p class="flame-hint"></p>
    <div class="flamegraph-scroll">
      <svg class="flamegraph-svg" preserveAspectRatio="none"></svg>
    </div>
    <div class="flame-tooltip" hidden></div>
  `

  const breadcrumb = container.querySelector('.flame-breadcrumb')
  const hint = container.querySelector('.flame-hint')
  const scroll = container.querySelector('.flamegraph-scroll')
  const svg = container.querySelector('.flamegraph-svg')
  const tooltip = container.querySelector('.flame-tooltip')
  const resetBtn = container.querySelector('.flame-reset')

  let rootTree = null
  let zoomStack = []
  let loading = false
  let clickTimer = null

  hint.textContent = hasAllocationTraces
    ? 'Allocation stack flamegraph. Click for details; double-click to zoom in.'
    : 'Retained-memory icicle chart. Click a frame for details; double-click to zoom in.'

  resetBtn.addEventListener('click', () => {
    zoomStack = [{ label: rootTree.name, tree: rootTree }]
    resetBtn.hidden = true
    render()
  })

  function applyRootTree(tree) {
    rootTree = tree
    zoomStack = [{ label: tree.name, tree }]
    resetBtn.hidden = true
    render()
  }

  function setTree(tree) {
    applyRootTree(tree)
  }

  function currentTree() {
    return zoomStack[zoomStack.length - 1].tree
  }

  function updateBreadcrumb() {
    breadcrumb.innerHTML = zoomStack
      .map((entry, i) => {
        const isLast = i === zoomStack.length - 1
        const sep = i > 0 ? '<span class="crumb-sep">›</span>' : ''
        if (isLast) return `${sep}<span class="crumb current">${escapeHtml(entry.label)}</span>`
        return `${sep}<button type="button" class="crumb link" data-i="${i}">${escapeHtml(entry.label)}</button>`
      })
      .join('')

    breadcrumb.querySelectorAll('.crumb.link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i)
        zoomStack = zoomStack.slice(0, i + 1)
        resetBtn.hidden = zoomStack.length <= 1
        render()
      })
    })

    resetBtn.hidden = zoomStack.length <= 1
  }

  function render() {
    const tree = currentTree()
    const width = Math.max(scroll.clientWidth || 800, 800)
    const rects = layoutIcicle(tree, width, ROW_HEIGHT)
    const height = Math.max(...rects.map((r) => r.y + r.height), ROW_HEIGHT)

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.innerHTML = ''

    for (const rect of rects) {
      if (rect.width < 1) continue

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.classList.add('flame-cell')
      if (rect.node.hasChildren) g.classList.add('has-children')

      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      el.setAttribute('x', String(rect.x))
      el.setAttribute('y', String(rect.y))
      el.setAttribute('width', String(rect.width))
      el.setAttribute('height', String(rect.height))
      el.setAttribute('fill', flameColor(rect.depth, rect.node.name))
      el.setAttribute('stroke', 'var(--bg)')
      el.setAttribute('stroke-width', '1')

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      title.textContent = `${rect.node.fullName ?? rect.node.name}\nRetained: ${formatBytes(rect.node.value)}${rect.node.hasChildren ? '\nDouble-click to zoom' : ''}`

      g.appendChild(el)

      if (rect.width > 54) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        label.setAttribute('x', String(rect.x + 4))
        label.setAttribute('y', String(rect.y + 14))
        label.textContent = truncate(rect.node.name, Math.min(48, rect.width / 5))
        g.appendChild(label)
      }

      g.appendChild(title)

      g.addEventListener('mouseenter', (e) => {
        tooltip.hidden = false
        tooltip.textContent = `${rect.node.name} — retained ${formatBytes(rect.node.value)}`
        moveTooltip(e)
      })
      g.addEventListener('mousemove', moveTooltip)
      g.addEventListener('mouseleave', () => {
        tooltip.hidden = true
      })

      g.addEventListener('click', () => {
        if (clickTimer) clearTimeout(clickTimer)
        clickTimer = setTimeout(() => {
          clickTimer = null
          handleSelect(rect.node)
        }, 250)
      })
      g.addEventListener('dblclick', (e) => {
        e.preventDefault()
        if (clickTimer) {
          clearTimeout(clickTimer)
          clickTimer = null
        }
        handleZoom(rect.node)
      })

      svg.appendChild(g)
    }

    updateBreadcrumb()
  }

  function moveTooltip(e) {
    const bounds = container.getBoundingClientRect()
    tooltip.style.left = `${e.clientX - bounds.left + 12}px`
    tooltip.style.top = `${e.clientY - bounds.top + 12}px`
  }

  function handleSelect(node) {
    if (node.nodeIndex != null) {
      onSelect({ type: 'node', nodeIndex: node.nodeIndex })
      return
    }

    const className = node.className ?? node.name
    const row = aggregates?.find((a) => a.key === node.classKey || a.name === className)
    if (row) {
      onSelect({ type: 'class', classKey: row.key, name: row.name, row })
      return
    }

    if (className && className !== 'Other' && node.name !== 'Retained heap') {
      onSelect({
        type: 'class',
        classKey: node.classKey ?? className,
        name: className,
        row: {
          count: 0,
          self: 0,
          maxRet: node.value,
          distance: '—',
        },
      })
    }
  }

  async function handleZoom(node) {
    if (loading) return
    if (!node.hasChildren) return

    loading = true
    tooltip.hidden = true

    let subtree
    if (node.mode === 'allocation' && node.allocId != null) {
      subtree = await queryWorker('flameSubtree', { mode: 'allocation', allocId: node.allocId })
    } else if (node.nodeIndex != null) {
      subtree = await queryWorker('flameSubtree', { nodeIndex: node.nodeIndex })
    } else if (node.className) {
      subtree = await queryWorker('flameSubtree', {
        className: node.className,
        classRetained: node.value,
      })
    } else {
      loading = false
      return
    }

    loading = false
    if (!subtree) return

    zoomStack.push({ label: node.name, tree: subtree })
    render()
  }

  const observer = new ResizeObserver(() => render())
  observer.observe(scroll)

  const onThemeChange = () => render()
  window.addEventListener('themechange', onThemeChange)

  return {
    el: container,
    setData(aggs, total, hasAlloc, flameTree) {
      if (flameTree) {
        applyRootTree(flameTree)
        return
      }
      if (hasAlloc) {
        queryWorker('flameSubtree', {}).then((tree) => {
          if (tree) applyRootTree(tree)
        })
      } else {
        queryWorker('flameSubtree', {
          aggregates: aggs,
          totalRetained: total,
        }).then((tree) => {
          if (tree) applyRootTree(tree)
        })
      }
    },
    destroy() {
      observer.disconnect()
      window.removeEventListener('themechange', onThemeChange)
    },
  }
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text
  return text.slice(0, Math.max(0, maxLen - 1)) + '…'
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
