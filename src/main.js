import { createDropZone, createLoadingView } from './components/drop-zone.js'
import { createStatsBar } from './components/stats-bar.js'
import { createSummaryTable } from './components/summary-table.js'
import { createTreemap } from './components/treemap.js'
import { createTopObjects } from './components/top-objects.js'
import { createSearch } from './components/search.js'
import { createInspector } from './components/inspector.js'
import { createFlamegraph } from './components/flamegraph.js'
import { createThemeToggle } from './components/theme-toggle.js'
import { initTheme } from './theme.js'
import Worker from './worker.js?worker'

initTheme()

const app = document.getElementById('app')
let worker = null
let requestId = 0
const pendingRequests = new Map()

function createWorkerBridge() {
  worker = new Worker()
  worker.onmessage = (event) => {
    const msg = event.data

    if (msg.type === 'progress') {
      loadingView?.setPhase(msg.message, msg.percent)
      return
    }

    if (msg.type === 'error') {
      alert(`Error: ${msg.message}`)
      showDropZone()
      return
    }

    if (msg.requestId != null && pendingRequests.has(msg.requestId)) {
      const { resolve } = pendingRequests.get(msg.requestId)
      pendingRequests.delete(msg.requestId)
      resolve(msg.objects ?? msg.results ?? msg.node ?? msg.path ?? msg.instances ?? msg.tree)
      return
    }

    if (msg.type === 'ready') {
      onSnapshotReady(msg)
    }
  }
}

function queryWorker(type, data = {}) {
  return new Promise((resolve) => {
    const id = ++requestId
    pendingRequests.set(id, { resolve })
    worker.postMessage({ type, requestId: id, ...data })
  })
}

let loadingView = null
let aggregates = []

function showDropZone() {
  app.innerHTML = ''
  worker?.terminate()
  worker = null
  pendingRequests.clear()

  const dropZone = createDropZone({ onFile: handleFile })
  dropZone.appendChild(createThemeToggle())
  app.appendChild(dropZone)
}

async function handleFile(file) {
  currentFileName = file.name

  app.innerHTML = ''
  loadingView = createLoadingView(file.name, file.size)
  app.appendChild(loadingView.el)

  createWorkerBridge()
  worker.postMessage({ type: 'parse', file })
}

function onSnapshotReady(msg) {
  aggregates = msg.aggregates
  app.innerHTML = ''

  const root = document.createElement('div')
  root.className = 'app'

  const header = document.createElement('header')
  header.className = 'app-header'
  const title = document.createElement('h1')
  title.textContent = fileLabel()
  const actions = document.createElement('div')
  actions.className = 'app-header-actions'
  actions.appendChild(createThemeToggle())
  const openBtn = document.createElement('button')
  openBtn.type = 'button'
  openBtn.className = 'btn btn-secondary'
  openBtn.textContent = 'Open another'
  openBtn.addEventListener('click', showDropZone)
  actions.appendChild(openBtn)
  header.appendChild(title)
  header.appendChild(actions)
  root.appendChild(header)

  const statsBar = createStatsBar()
  statsBar.update(msg.stats, msg.staticData, msg.parseDuration)
  root.appendChild(statsBar.el)

  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  const tabDefs = [
    { id: 'summary', label: 'Summary' },
    { id: 'treemap', label: 'Treemap' },
    { id: 'flame', label: 'Flamegraph' },
    { id: 'top', label: 'Top Objects' },
    { id: 'search', label: 'Search' },
  ]

  const views = {}
  const viewContainer = document.createElement('div')
  viewContainer.className = 'main-content'

  function handleSelect(selection) {
    if (selection.type === 'class') {
      summaryTable.selectByKey(selection.classKey)
      treemap.highlight(selection.classKey, aggregates)
    }
    inspector.show(selection)
  }

  const summaryTable = createSummaryTable({ onSelect: handleSelect })
  const treemap = createTreemap({ onSelect: handleSelect })
  const topObjects = createTopObjects({ onSelect: handleSelect, queryWorker })
  const search = createSearch({ onSelect: handleSelect, queryWorker })
  const flamegraph = createFlamegraph({
    aggregates,
    totalRetained: msg.stats.total,
    hasAllocationTraces: msg.hasAllocationTraces,
    queryWorker,
    onSelect: handleSelect,
  })
  const inspector = createInspector({ queryWorker })

  views.summary = summaryTable.el
  views.treemap = treemap.el
  views.flame = flamegraph.el
  views.top = topObjects.el
  views.search = search.el

  summaryTable.setData(aggregates)
  treemap.setData(aggregates)
  flamegraph.setData(aggregates, msg.stats.total, msg.hasAllocationTraces, msg.flameTree)

  let activeTab = 'summary'

  function switchTab(id) {
    activeTab = id
    tabs.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === id)
    })
    viewContainer.innerHTML = ''
    viewContainer.appendChild(views[id])
  }

  tabDefs.forEach(({ id, label }) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'tab' + (id === activeTab ? ' active' : '')
    tab.dataset.tab = id
    tab.textContent = label
    tab.addEventListener('click', () => switchTab(id))
    tabs.appendChild(tab)
  })

  const mainLayout = document.createElement('div')
  mainLayout.className = 'main-layout'
  switchTab('summary')
  mainLayout.appendChild(viewContainer)
  mainLayout.appendChild(inspector.el)

  root.appendChild(tabs)
  root.appendChild(mainLayout)
  app.appendChild(root)
}

let currentFileName = ''

function fileLabel() {
  return currentFileName || 'Heap Snapshot'
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

showDropZone()
